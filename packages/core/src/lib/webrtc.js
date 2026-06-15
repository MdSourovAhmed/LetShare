export const RTC_CONFIG = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
}
export const CHUNK_SIZE         = 64 * 1024
export const BUFFER_LOW         = 512 * 1024
export const CONNECT_TIMEOUT_MS = 45_000