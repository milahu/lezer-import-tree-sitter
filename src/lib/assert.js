export function assert(condition, message) {
  if (!condition) {
    if (typeof message == "function") {
      message = message()
    }
    if (message) {
      console.error(message)
    }
    const error = new Error("assertion error")
    const lines = error.stack.split("\n")
    // remove line 2, so first stack frame is call to assert
    lines.splice(1, 1)
    error.stack = lines.join("\n")
    throw error
  }
}
