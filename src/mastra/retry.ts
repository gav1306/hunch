/**
 * Run a structured-output model call, asking once more if the reply fails its
 * schema.
 *
 * A model that leaves out a key or writes prose is usually fine on a second
 * try, and a one-off slip shouldn't cost the user a "try again". Anything else
 * (an out-of-credits 402, a timeout, a network error) is thrown straight away:
 * asking again would only double the wait before the route reports it.
 */
export async function retryOnInvalidOutput<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!isInvalidOutput(err)) throw err;
    console.warn("[llm] structured output failed validation, retrying once:", err);
    return call();
  }
}

function isInvalidOutput(err: unknown): boolean {
  return err instanceof Error && /structured output validation failed/i.test(err.message);
}
