// iPhone Safari sometimes loses its database service while the app sits in the background; the next read then fails
// with "UnknownError: Attempt to get records from database without an in-progress transaction" (owner's phone, 15 Nov,
// app errors). Opening the database again works, so a failed read of that kind is tried once more after a moment.
const TRANSIENT = /UnknownError|InvalidStateError|TransactionInactiveError|in-progress transaction|connection is closing|database connection/i;

export function isTransientIdbError(e: unknown) {
  const err = e as { name?: string; message?: string } | null;
  return Boolean(err && TRANSIENT.test(`${err.name || ""} ${err.message || ""}`));
}

export async function idbRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    if (!isTransientIdbError(e)) throw e;
    await new Promise((r) => setTimeout(r, 200));
    return read();
  }
}
