export type NonNullableReturn<F extends (...args: any) => any> =
  (...args: Parameters<F>) => NonNullable<ReturnType<F>>
