import { onUnmounted } from 'vue'

export function useFoo() {
  // placeholder for wrapping flutter bridge functions
}

function send(name: string, data: any) {
  // @ts-expect-error global
  if (typeof flutterObject !== 'undefined' && flutterObject) {
    const postInfo = JSON.stringify({ name, data })

    // @ts-expect-error global
    flutterObject.postMessage(postInfo)
  }
}

function listen(cb?: (event: { data: string }) => void) {
  // @ts-expect-error global
  if (typeof flutterObject !== 'undefined' && flutterObject) {
    if (cb) {
      // @ts-expect-error global
      flutterObject.addEventListener('message', cb)

      onUnmounted(() => {
        // @ts-expect-error global
        flutterObject.removeEventListener('message', cb)
      })
    }
  }
}
