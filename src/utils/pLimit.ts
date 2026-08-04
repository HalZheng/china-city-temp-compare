/**
 * 并发限制器：限制同时执行的 Promise 数量。
 * 用于多年份查询时限制并发数，避免触发 API 429 限流。
 *
 * @param concurrency 最大并发数
 * @returns 限制并发的函数包装器
 */
export function pLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    if (activeCount >= concurrency || queue.length === 0) return;
    activeCount++;
    const run = queue.shift()!;
    run();
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            activeCount--;
            next();
          });
      };
      queue.push(run);
      next();
    });
}
