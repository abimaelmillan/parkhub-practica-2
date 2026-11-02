import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Reservation } from "../reservation.model";
import { hasTimeConflict, validateExtensionEndTime } from "../reservation.rules";
import { extendReservation } from "../reservation.service";

// El Service se prueba sin MongoDB: el Model se reemplaza por funciones simuladas.
jest.mock("../reservation.model", () => ({
  Reservation: { findById: jest.fn(), find: jest.fn() },
}));

type AnyFunction = (...args: any[]) => any;
const findByIdMock = Reservation.findById as unknown as jest.Mock<AnyFunction>;
const findMock = Reservation.find as unknown as jest.Mock<AnyFunction>;

describe("validateExtensionEndTime", () => {
  const now = new Date("2026-11-01T10:30:00.000Z");
  const currentEnd = new Date("2026-11-01T11:00:00.000Z");

  test("CP-01 returns the new end time when it is after the current end", () => {
    // Arrange
    const newEndTime = "2026-11-01T12:00:00.000Z";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, now);

    // Assert
    expect(newEnd).toEqual(new Date(newEndTime));
  });

  test("CP-12 accepts a new end time one minute after the current end", () => {
    // Arrange
    const newEndTime = "2026-11-01T11:01:00.000Z";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, now);

    // Assert
    expect(newEnd).toEqual(new Date(newEndTime));
  });

  test("CP-11 returns null when the new end time equals the current end", () => {
    // Arrange
    const newEndTime = "2026-11-01T11:00:00.000Z";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, now);

    // Assert
    expect(newEnd).toBeNull();
  });

  test("CP-09 returns null when the new end time is before the current end", () => {
    // Arrange
    const newEndTime = "2026-11-01T10:45:00.000Z";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, now);

    // Assert
    expect(newEnd).toBeNull();
  });

  test("CP-07 returns null for an invalid date string", () => {
    // Arrange
    const newEndTime = "mañana";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, now);

    // Assert
    expect(newEnd).toBeNull();
  });

  test("CP-08 returns null when the new end time is missing or is not a string", () => {
    // Arrange
    const invalidValues = [undefined, null, 1762000000000];

    // Act
    const results = invalidValues.map((value) =>
      validateExtensionEndTime(currentEnd, value, now),
    );

    // Assert
    expect(results).toEqual([null, null, null]);
  });

  test("CP-06 returns null when the reservation already ended", () => {
    // Arrange
    const later = new Date("2026-11-01T11:30:00.000Z");
    const newEndTime = "2026-11-01T12:00:00.000Z";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, later);

    // Assert
    expect(newEnd).toBeNull();
  });

  test("CP-16 returns null when the reservation ends exactly now", () => {
    // Arrange
    const sameMoment = new Date("2026-11-01T11:00:00.000Z");
    const newEndTime = "2026-11-01T12:00:00.000Z";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, sameMoment);

    // Assert
    expect(newEnd).toBeNull();
  });

  test("CP-18 accepts the extension of a reservation that has not started yet", () => {
    // Arrange
    const beforeStart = new Date("2026-11-01T08:00:00.000Z");
    const newEndTime = "2026-11-01T12:00:00.000Z";

    // Act
    const newEnd = validateExtensionEndTime(currentEnd, newEndTime, beforeStart);

    // Assert
    expect(newEnd).toEqual(new Date(newEndTime));
  });
});

describe("hasTimeConflict with an extended period", () => {
  const start = new Date("2026-11-01T10:00:00.000Z");
  const newEnd = new Date("2026-11-01T12:00:00.000Z");

  test("CP-10 reports a conflict when the extension overlaps the next reservation", () => {
    // Arrange
    const otherStart = new Date("2026-11-01T11:30:00.000Z");
    const otherEnd = new Date("2026-11-01T12:30:00.000Z");

    // Act
    const conflict = hasTimeConflict(start, newEnd, otherStart, otherEnd);

    // Assert
    expect(conflict).toBe(true);
  });

  test("CP-13 allows an extension that ends exactly when the next reservation starts", () => {
    // Arrange
    const otherStart = new Date("2026-11-01T12:00:00.000Z");
    const otherEnd = new Date("2026-11-01T13:00:00.000Z");

    // Act
    const conflict = hasTimeConflict(start, newEnd, otherStart, otherEnd);

    // Assert
    expect(conflict).toBe(false);
  });
});

describe("extendReservation", () => {
  const RESERVATION_ID = "6650a0000000000000000001";
  const SPOT_ID = "6650a00000000000000000a1";
  const MINUTE = 60 * 1000;

  // Fechas relativas al momento de la prueba, porque el Service usa la hora actual.
  const fromNow = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

  function buildReservation(overrides: Record<string, unknown> = {}) {
    const reservation = {
      _id: RESERVATION_ID,
      parkingSpotId: SPOT_ID,
      startTime: fromNow(-30),
      endTime: fromNow(30),
      status: "ACTIVE",
      ...overrides,
      save: jest.fn<AnyFunction>(),
    };
    reservation.save.mockResolvedValue(reservation);
    return reservation;
  }

  beforeEach(() => {
    findByIdMock.mockReset();
    findMock.mockReset();
    findMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("CP-01 updates the end time, saves it and returns the reservation", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(90).toISOString();

    // Act
    const result = await extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    expect(result).toBe(reservation);
    expect(result.endTime).toEqual(new Date(newEndTime));
    expect(reservation.save).toHaveBeenCalledTimes(1);
  });

  test("CP-04 rejects an invalid id with 404 without querying MongoDB", async () => {
    // Arrange
    const newEndTime = fromNow(90).toISOString();

    // Act
    const result = extendReservation("abc", newEndTime);

    // Assert
    await expect(result).rejects.toMatchObject({ status: 404 });
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  test("CP-03 rejects a reservation that does not exist with 404", async () => {
    // Arrange
    findByIdMock.mockResolvedValue(null);
    const newEndTime = fromNow(90).toISOString();

    // Act
    const result = extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    await expect(result).rejects.toMatchObject({ status: 404 });
    expect(findMock).not.toHaveBeenCalled();
  });

  test("CP-05 rejects a cancelled reservation with 409 and does not save", async () => {
    // Arrange
    const reservation = buildReservation({ status: "CANCELLED" });
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(90).toISOString();

    // Act
    const result = extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(reservation.save).not.toHaveBeenCalled();
  });

  test("CP-06 rejects a reservation that already ended with 409 and does not save", async () => {
    // Arrange
    const reservation = buildReservation({ startTime: fromNow(-120), endTime: fromNow(-60) });
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(90).toISOString();

    // Act
    const result = extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(reservation.save).not.toHaveBeenCalled();
  });

  test("CP-16 rejects with 409 a reservation that ends exactly now", async () => {
    // Arrange: se fija la hora actual en 11:00; solo se simula Date, no los timers
    jest.useFakeTimers({
      now: new Date("2026-11-01T11:00:00.000Z"),
      doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval",
        "clearInterval", "queueMicrotask", "hrtime", "performance"],
    });
    const reservation = buildReservation({
      startTime: new Date("2026-11-01T10:00:00.000Z"),
      endTime: new Date("2026-11-01T11:00:00.000Z"),
    });
    findByIdMock.mockResolvedValue(reservation);

    // Act
    const result = extendReservation(RESERVATION_ID, "2026-11-01T12:00:00.000Z");

    // Assert
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(reservation.save).not.toHaveBeenCalled();
  });

  test("CP-07 rejects an invalid end time with 400 and keeps the reservation unchanged", async () => {
    // Arrange
    const reservation = buildReservation();
    const originalEnd = reservation.endTime;
    findByIdMock.mockResolvedValue(reservation);

    // Act
    const result = extendReservation(RESERVATION_ID, "mañana");

    // Assert
    await expect(result).rejects.toMatchObject({ status: 400 });
    expect(reservation.endTime).toBe(originalEnd);
    expect(reservation.save).not.toHaveBeenCalled();
  });

  test("CP-08 rejects a request without end time with 400", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);

    // Act
    const result = extendReservation(RESERVATION_ID, undefined);

    // Assert
    await expect(result).rejects.toMatchObject({ status: 400 });
    expect(reservation.save).not.toHaveBeenCalled();
  });

  test("CP-09 rejects an end time before the current end with 400", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(15).toISOString();

    // Act
    const result = extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    await expect(result).rejects.toMatchObject({ status: 400 });
    expect(reservation.save).not.toHaveBeenCalled();
  });

  test("CP-10 rejects with 409 when another active reservation overlaps the extension", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    findMock.mockResolvedValue([{ startTime: fromNow(60), endTime: fromNow(120) }]);
    const newEndTime = fromNow(90).toISOString();

    // Act
    const result = extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(reservation.save).not.toHaveBeenCalled();
  });

  test("CP-10 looks for conflicts between the original start and the new end time", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    const newEnd = fromNow(90);

    // Act
    await extendReservation(RESERVATION_ID, newEnd.toISOString());

    // Assert
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: { $lt: newEnd },
        endTime: { $gt: reservation.startTime },
      }),
    );
  });

  test("CP-13 saves when the next reservation starts exactly at the new end time", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    const newEnd = fromNow(90);
    findMock.mockResolvedValue([{ startTime: newEnd, endTime: fromNow(150) }]);

    // Act
    const result = await extendReservation(RESERVATION_ID, newEnd.toISOString());

    // Assert
    expect(result.endTime).toEqual(newEnd);
    expect(reservation.save).toHaveBeenCalledTimes(1);
  });

  test("CP-14 only looks for conflicts in ACTIVE reservations", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(90).toISOString();

    // Act
    await extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    expect(findMock).toHaveBeenCalledWith(expect.objectContaining({ status: "ACTIVE" }));
    expect(reservation.save).toHaveBeenCalledTimes(1);
  });

  test("CP-15 excludes the reservation being extended from the conflict search", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(90).toISOString();

    // Act
    await extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $ne: RESERVATION_ID } }),
    );
    expect(reservation.save).toHaveBeenCalledTimes(1);
  });

  test("CP-17 only looks for conflicts in the same parking spot", async () => {
    // Arrange
    const reservation = buildReservation();
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(90).toISOString();

    // Act
    await extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    expect(findMock).toHaveBeenCalledWith(expect.objectContaining({ parkingSpotId: SPOT_ID }));
    expect(reservation.save).toHaveBeenCalledTimes(1);
  });

  test("CP-18 extends a reservation that has not started yet", async () => {
    // Arrange
    const reservation = buildReservation({ startTime: fromNow(60), endTime: fromNow(120) });
    findByIdMock.mockResolvedValue(reservation);
    const newEndTime = fromNow(180).toISOString();

    // Act
    const result = await extendReservation(RESERVATION_ID, newEndTime);

    // Assert
    expect(result.endTime).toEqual(new Date(newEndTime));
    expect(reservation.save).toHaveBeenCalledTimes(1);
  });
});
