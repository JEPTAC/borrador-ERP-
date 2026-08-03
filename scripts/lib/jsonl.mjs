import fs from 'node:fs'
import zlib from 'node:zlib'
import readline from 'node:readline'

export function writer(file) {
  const gzip = zlib.createGzip({ level: 9 })
  const out = fs.createWriteStream(file)
  gzip.pipe(out)
  return {
    write(value) { gzip.write(`${JSON.stringify(value)}\n`) },
    close() {
      return new Promise((resolve, reject) => {
        out.once('close', resolve)
        out.once('error', reject)
        gzip.end()
      })
    }
  }
}
export async function* read(file) {
  const input = fs.createReadStream(file).pipe(zlib.createGunzip())
  const rl = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) if (line.trim()) yield JSON.parse(line)
}
