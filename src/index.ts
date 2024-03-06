import * as child from 'child_process'
import * as EventEmitter from 'events'
import * as readline from 'readline'
import Debug from 'debug'
import * as systrayBin from 'systray-bin'
import { Readable } from 'stream'

const debug = Debug(`@3xpo/systray`)

export type MenuItem = {
  title: string,
  tooltip: string,
  checked?: boolean | null | undefined,
  enabled: boolean,
}

export type Menu = {
  icon: string,
  title: string,
  tooltip: string,
  items: MenuItem[],
}

export type ClickEvent = {
  type: 'clicked',
  item: MenuItem,
  seq_id: number,
}

export type ReadyEvent = {
  type: 'ready',
}

export type Event = ClickEvent | ReadyEvent

export type UpdateItemAction = {
  type: 'update-item',
  item: MenuItem,
  seq_id: number,
}

export type UpdateMenuAction = {
  type: 'update-menu',
  menu: Menu,
  seq_id: number,
}

export type UpdateMenuAndItemAction = {
  type: 'update-menu-and-item',
  menu: Menu,
  item: MenuItem,
  seq_id: number,
}

export type Action = UpdateItemAction | UpdateMenuAction | UpdateMenuAndItemAction

export type Conf = {
  menu: Menu,
  /** @deprecated Unused */
  debug?: boolean,
  /** @deprecated Assuming {@link SysTray.install} or {@link systrayBin.install} are called & awaited BEFORE you perform any actions, this always happens */
  copyDir?: boolean | string
}

const getTrayBinPath = () => {
  return systrayBin.install(false)
}
const CHECK_STR = ' 🮱'
const NOT_CHECK_STR = ' 🅇'
function updateCheckedInLinux(item: MenuItem) {
  if (process.platform !== 'linux') {
    return item
  }
  item.title = (item.title ?? '').replace(CHECK_STR, '').replace(NOT_CHECK_STR, '')
  if (item.checked)
    item.title += CHECK_STR
  else if (typeof item.checked === 'boolean')
    item.title += NOT_CHECK_STR
  return item
}

/**
 * Call (& await) {@link SysTray.install} before doing anything! This ensures the executable actually exists.
 * @example ```ts
 * import * as fs from 'fs';
 * import Systray from '@3xpo/systray';
 * (async()=>{
 *   await Systray.install()
 *   const systray = new Systray({
 *     menu: {
 *       // use .png icon on posix & .ico on windows
 *       icon: fs.readFileSync(`${__dirname}/test-icons/icon.${process.platform === 'win32' ? 'ico' : 'png'}`).toString('base64'),
 *       title: "Test",
 *       tooltip: "Tips",
 *       items: [{
 *         title: "checkable",
 *         tooltip: "This can be checked & unchecked",
 *         checked: true,
 *         enabled: true
 *       }, {
 *         title: "thing",
 *         tooltip: "Click this to log stuff",
 *         enabled: true
 *       }, {
 *         title: "Exit",
 *         tooltip: "Quits the application",
 *         enabled: true
 *       }]
 *     },
 *   })
 *   
 *   systray.onClick(action => {
 *     if (action.seq_id === 0) {
 *       console.log('action', action)
 *       systray.sendAction({
 *         type: 'update-item',
 *         item: {
 *           ...action.item,
 *           checked: !action.item.checked,
 *         },
 *         seq_id: action.seq_id,
 *       })
 *     } else if (action.seq_id === 1) {
 *       // open the url
 *       console.log('open the url', action)
 *     } else if (action.seq_id === 2) {
 *       systray.kill()
 *       process.exit()
 *     }
 *   })
 * })()
 * ```
 */
export default class SysTray extends EventEmitter {
  protected _conf: Conf
  protected _process: child.ChildProcess
  protected _rl: readline.ReadLine
  protected _binPath: string

  constructor(conf: Conf) {
    super()
    this._conf = conf
    this._binPath = systrayBin.filepath
    this._process = child.spawn(this._binPath, [], {
      windowsHide: true
    })
    this._rl = readline.createInterface({
      input: this._process.stdout as unknown as Readable,
    })
    conf.menu.items = conf.menu.items.map(updateCheckedInLinux)
    this._rl.on('line', data => debug('onLine', data))
    this.onReady(() => this.writeLine(JSON.stringify(conf.menu)))
  }

  /** Call this (& await it) before doing anything! This ensures the executable actually exists */
  static async install() {
    await systrayBin.install(false)
  }
  /** Call this (& await it) before doing anything! This ensures the executable actually exists */
  async install() {
    this._binPath = await getTrayBinPath()
  }

  onReady(listener: (...empty: void[]) => void) {
    this._rl.on('line', (line: string) => {
      let action: Event = JSON.parse(line)
      if (action.type === 'ready') {
        listener()
        debug('onReady', action)
      }
    })
    return this
  }

  onClick(listener: (action: ClickEvent) => void) {
    this._rl.on('line', (line: string) => {
      let action: ClickEvent = JSON.parse(line)
      if (action.type === 'clicked') {
        debug('onClick', action)
        listener(action)
      }
    })
    return this
  }

  writeLine(line: string) {
    if (line) {
      debug('writeLine', line + '\n', '=====')
      this._process.stdin?.write(line.trim() + '\n')
    }
    return this
  }

  sendAction(action: Action) {
    switch (action.type) {
      case 'update-item':
        action.item = updateCheckedInLinux(action.item)
        break
      case 'update-menu':
        action.menu.items = action.menu.items.map(updateCheckedInLinux)
        break
      case 'update-menu-and-item':
        action.menu.items = action.menu.items.map(updateCheckedInLinux)
        action.item = updateCheckedInLinux(action.item)
        break
    }
    debug('sendAction', action)
    this.writeLine(JSON.stringify(action))
    return this
  }
  /**
   * Kill the systray process
   * @param exitNode Exit current node process after systray process is killed, default is true
   */
  kill(exitNode = true) {
    if (exitNode) {
      this.onExit(() => process.exit(0))
    }
    this._rl.close()
    this._process.kill()
  }

  onExit(listener: (code: number | null, signal: string | null) => void) {
    this._process.on('exit', listener)
  }

  onError(listener: (err: Error) => void) {
    this._process.on('error', err => {
      debug('onError', err, 'binPath', this.binPath)
      listener(err)
    })
  }

  get killed() {
    return this._process.killed
  }

  get binPath() {
    return this._binPath
  }
}
