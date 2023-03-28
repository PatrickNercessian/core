import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { tmpdir } from 'node:os'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { getPaths } from '../lib/paths.js'
import assert from 'node:assert'

const __dirname = dirname(fileURLToPath(import.meta.url))
const station = join(__dirname, '..', 'bin', 'station.js')

// From https://lotus.filecoin.io/lotus/manage/manage-fil/
const FIL_WALLET_ADDRESS = 'f1abjxfbp274xpdqcpuaykwkfb43omjotacm2p3za'

describe('FIL_WALLET_ADDRESS', () => {
  it('fails without address', async () => {
    await assert.rejects(execa(station))
  })
  it('works with address', async () => {
    const ps = execa(station, { env: { FIL_WALLET_ADDRESS } })
    await once(ps.stdout, 'data')
    ps.kill()
  })
})

describe('--version', () => {
  it('outputs version', async () => {
    await execa(station, ['--version'])
    await execa(station, ['-v'])
  })
})

describe('--help', () => {
  it('outputs help text', async () => {
    await execa(station, ['--help'])
    await execa(station, ['-h'])
  })
})

describe('Storage', async () => {
  it('creates files', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const ps = execa(station, {
      env: {
        FIL_WALLET_ADDRESS,
        ROOT_DIR
      }
    })
    while (true) {
      await once(ps.stdout, 'data')
      try {
        await fs.stat(
          join(
            ROOT_DIR, 'logs', 'modules', 'saturn-L2-node.log'
          )
        )
        break
      } catch {}
    }
    ps.kill()
    await fs.stat(ROOT_DIR)
    await fs.stat(join(ROOT_DIR, 'modules'))
    await fs.stat(join(ROOT_DIR, 'logs'))
    await fs.stat(join(ROOT_DIR, 'logs', 'modules'))
  })
})

describe('Metrics', () => {
  it('handles empty metrics', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const { stdout } = await execa(
      station,
      ['metrics'],
      { env: { ROOT_DIR } }
    )
    assert.deepStrictEqual(
      stdout,
      JSON.stringify({ totalJobsCompleted: 0, totalEarnings: '0' }, 0, 2)
    )
  })
  it('outputs metrics', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    await fs.mkdir(
      dirname(getPaths(ROOT_DIR).metrics),
      { recursive: true }
    )
    await fs.writeFile(
      getPaths(ROOT_DIR).metrics,
      '[date] {"totalJobsCompleted":1,"totalEarnings":"2"}\n'
    )
    const { stdout } = await execa(
      station,
      ['metrics'],
      { env: { ROOT_DIR } }
    )
    assert.deepStrictEqual(
      stdout,
      JSON.stringify({ totalJobsCompleted: 1, totalEarnings: '2' }, 0, 2)
    )
  })

  describe('Follow', async () => {
    for (const flag of ['-f', '--follow']) {
      it(flag, async () => {
        const ROOT_DIR = join(tmpdir(), randomUUID())
        const ps = execa(station, ['metrics', flag], { env: { ROOT_DIR } })
        await once(ps.stdout, 'data')
        ps.kill()
      })
    }
  })

  it('can be read while station is running', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const ps = execa(station, { env: { ROOT_DIR, FIL_WALLET_ADDRESS } })
    await once(ps.stdout, 'data')
    const { stdout } = await execa(
      station,
      ['metrics'],
      { env: { ROOT_DIR } }
    )
    assert.deepStrictEqual(
      stdout,
      JSON.stringify({ totalJobsCompleted: 0, totalEarnings: '0' }, 0, 2)
    )
    ps.kill()
  })
})

describe('Logs', () => {
  it('handles no logs', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const { stdout } = await execa(
      station,
      ['logs'],
      { env: { ROOT_DIR } }
    )
    assert.strictEqual(stdout, '')
  })
  it('outputs logs', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    await fs.mkdir(getPaths(ROOT_DIR).moduleLogs, { recursive: true })
    await fs.writeFile(getPaths(ROOT_DIR).allLogs, '[date] beep boop\n')
    const { stdout } = await execa(
      station,
      ['logs'],
      { env: { ROOT_DIR } }
    )
    assert.strictEqual(stdout, '[date] beep boop')
  })

  describe('Follow', () => {
    it('reads logs', async () => {
      for (const flag of ['-f', '--follow']) {
        it(flag, async () => {
          const ROOT_DIR = join(tmpdir(), randomUUID())
          await fs.mkdir(
            getPaths(ROOT_DIR).moduleLogs,
            { recursive: true }
          )
          const ps = execa(station, ['logs', flag], { env: { ROOT_DIR } })
          const [data] = await Promise.all([
            once(ps.stdout, 'data'),
            fs.writeFile(getPaths(ROOT_DIR).allLogs, '[date] beep boop\n')
          ])
          assert.strictEqual(data.toString(), '[date] beep boop\n')
          ps.kill()
        })
      }
    })
    it('doesn\'t block station from running', async () => {
      const ROOT_DIR = join(tmpdir(), randomUUID())
      const logsPs = execa(
        station,
        ['logs', '--follow'],
        { env: { ROOT_DIR } }
      )
      const stationPs = execa(
        station,
        { env: { ROOT_DIR, FIL_WALLET_ADDRESS } }
      )
      await Promise.all([
        once(stationPs.stdout, 'data'),
        once(logsPs.stdout, 'data')
      ])
      logsPs.kill()
      stationPs.kill()
    })
  })

  it('can be read while station is running', async function () {
    this.timeout(5_000)
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const ps = execa(station, { env: { ROOT_DIR, FIL_WALLET_ADDRESS } })
    await once(ps.stdout, 'data')
    const { stdout } = await execa(
      station,
      ['logs'],
      { env: { ROOT_DIR } }
    )
    ps.kill()
    assert(stdout)
  })
})

describe('Activity', () => {
  it('handles no activity', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const { stdout } = await execa(
      station,
      ['activity'],
      { env: { ROOT_DIR } }
    )
    assert.strictEqual(stdout, '')
  })
  it('outputs activity', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    await fs.mkdir(
      dirname(getPaths(ROOT_DIR).activity),
      { recursive: true }
    )
    await fs.writeFile(
      getPaths(ROOT_DIR).activity,
      '[3/14/2023, 10:38:14 AM] {"source":"Saturn","type":"info","message":"beep boop"}\n'
    )
    const { stdout } = await execa(
      station,
      ['activity'],
      { env: { ROOT_DIR } }
    )
    assert.match(stdout, /3\/14\/2023/)
    assert.match(stdout, /beep boop/)
  })

  describe('Follow', () => {
    it('reads activity', async () => {
      for (const flag of ['-f', '--follow']) {
        it(flag, async () => {
          const ROOT_DIR = join(tmpdir(), randomUUID())
          await fs.mkdir(
            dirname(getPaths(ROOT_DIR).activity),
            { recursive: true }
          )
          const ps = execa(
            station,
            ['activity', flag],
            { env: { ROOT_DIR } }
          )
          const [data] = await Promise.all([
            once(ps.stdout, 'data'),
            fs.writeFile(
              getPaths(ROOT_DIR).activity,
              '[3/14/2023, 10:38:14 AM] {"source":"Saturn","type":"info","message":"beep boop"}\n'
            )
          ])
          assert.match(data.toString(), '3/14/2023')
          assert.match(data.toString(), 'beep boop')
          ps.kill()
        })
      }
    })
    it('doesn\'t block station from running', async () => {
      const ROOT_DIR = join(tmpdir(), randomUUID())
      const activityPs = execa(
        station,
        ['activity', '--follow'],
        { env: { ROOT_DIR } }
      )
      const stationPs = execa(
        station,
        { env: { ROOT_DIR, FIL_WALLET_ADDRESS } }
      )
      await Promise.all([
        once(stationPs.stdout, 'data'),
        once(activityPs.stdout, 'data')
      ])
      activityPs.kill()
      stationPs.kill()
    })
  })

  it('can be read while station is running', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const ps = execa(station, { env: { ROOT_DIR, FIL_WALLET_ADDRESS } })
    await once(ps.stdout, 'data')
    const { stdout } = await execa(
      station,
      ['activity'],
      { env: { ROOT_DIR } }
    )
    assert(stdout)
    ps.kill()
  })
})

describe('Events', () => {
  it('read events', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    await fs.mkdir(
      dirname(getPaths(ROOT_DIR).activity),
      { recursive: true }
    )
    await fs.writeFile(
      getPaths(ROOT_DIR).activity,
      '[3/14/2023, 10:38:14 AM] {"source":"Saturn","type":"info","message":"beep boop"}\n'
    )
    const ps = execa(
      station,
      ['events'],
      { env: { ROOT_DIR } }
    )
    const events = []
    for await (const line of ps.stdout) {
      events.push(JSON.parse(line.toString()))
      if (events.length === 2) break
    }
    ps.kill()
    assert.deepStrictEqual(events, [
      { type: 'jobs-completed', total: 0 },
      { type: 'activity:info', module: 'Saturn', message: 'beep boop' }
    ])
  })
  it('can be read while station is running', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const stationPs = execa(
      station,
      { env: { ROOT_DIR, FIL_WALLET_ADDRESS } }
    )
    const eventsPs = execa(
      station,
      ['events'],
      { env: { ROOT_DIR } }
    )
    await Promise.all([
      once(stationPs.stdout, 'data'),
      once(eventsPs.stdout, 'data')
    ])
    stationPs.kill()
    eventsPs.kill()
  })
  it('doesn\'t block station from running', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const eventsPs = execa(station, ['events'], { env: { ROOT_DIR } })
    const stationPs = execa(
      station,
      { env: { ROOT_DIR, FIL_WALLET_ADDRESS } }
    )
    await Promise.all([
      once(stationPs.stdout, 'data'),
      once(eventsPs.stdout, 'data')
    ])
    eventsPs.kill()
    stationPs.kill()
  })
})

describe('Lockfile', () => {
  it('prevents multiple instances from running', async () => {
    const ROOT_DIR = join(tmpdir(), randomUUID())
    const ps = execa(station, { env: { ROOT_DIR, FIL_WALLET_ADDRESS } })
    await once(ps.stdout, 'data')
    try {
      await assert.rejects(
        execa(station, { env: { ROOT_DIR, FIL_WALLET_ADDRESS } }),
        err => {
          assert.strictEqual(err.exitCode, 1)
          assert.match(err.stderr, /is already running/)
          return true
        }
      )
    } finally {
      ps.kill()
    }
  })
})

describe('Scripts', () => {
  it('updates modules', async function () {
    this.timeout(5_000)
    await execa(join(__dirname, '..', 'scripts', 'update-modules.js'))
  })
})
