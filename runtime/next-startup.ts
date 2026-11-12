import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { stripVTControlCharacters } from 'node:util'

// Keep the Next.js 16 standalone banner together, then pass stdout through.
// If the format changes, forward the original output and let the child boot.
export function frameNextStartup() {
  const decoder = new StringDecoder('utf8')
  const maxBannerSize = 8_192
  let pending = ''
  let banner = ''
  let finished = false

  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      if (finished) return done(null, chunk)

      pending += decoder.write(chunk)
      let output = ''
      let newline = pending.indexOf('\n')
      while (!finished && newline !== -1) {
        const line = pending.slice(0, newline + 1)
        pending = pending.slice(newline + 1)
        const text = stripVTControlCharacters(line).trim()

        if (!banner) {
          if (text.startsWith('▲ Next.js ')) banner = line
          else output += line
        } else if (text.startsWith('✓ Ready in ')) {
          output += `\n${banner}${line}\n`
          banner = ''
          finished = true
        } else if (/^- (Local|Network|Debugger port|Environments):/.test(text)
          && banner.length + line.length <= maxBannerSize) {
          banner += line
        } else {
          output += banner + line
          banner = ''
          finished = true
        }
        newline = pending.indexOf('\n')
      }

      if (finished || pending.length + banner.length > maxBannerSize) {
        finished = true
        output += banner + pending + decoder.end()
        banner = pending = ''
      }
      done(null, output)
    },
    flush(done) {
      done(null, banner + pending + decoder.end())
    },
  })
}
