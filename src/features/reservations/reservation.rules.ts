export function validateReservationPeriod(startTime: unknown, endTime: unknown) {
  if (typeof startTime !== 'string' || typeof endTime !== 'string') {
    return null;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return null;
  }

  return { start, end };
}

export function hasTimeConflict(
  newStart: Date,
  newEnd: Date,
  existingStart: Date,
  existingEnd: Date
) {
  return newStart < existingEnd && newEnd > existingStart;
}

export function canReserveSpot(active: boolean, hasConflict: boolean) {
  return active && !hasConflict;
}

export function validateExtensionEndTime(
  currentEnd: Date,
  newEndTime: unknown,
  now: Date
): Date | null {
  // PRACTICE 2 (completado): la reservación sigue vigente y la nueva hora es
  // una fecha válida estrictamente posterior a la hora final actual.
  if (typeof newEndTime !== 'string' || currentEnd <= now) {
    return null;
  }

  const newEnd = new Date(newEndTime);

  if (Number.isNaN(newEnd.getTime()) || newEnd <= currentEnd) {
    return null;
  }

  return newEnd;
}
