import { EventEmitter } from 'events'
import rlp from 'rlp-encoding'
import ms from 'ms'
import { int2buffer, buffer2int, assertEq, formatLogId, formatLogData } from '../util'
import { Peer, DISCONNECT_REASONS } from '../rlpx/peer'

import { debug as createDebugLogger } from 'debug'
const debug = createDebugLogger('devp2p:fourtwenty')
const verbose = createDebugLogger('verbose').enabled

type SendMethod = (code: FOURTWENTY.MESSAGE_CODES, data: Buffer) => any

export class FOURTWENTY extends EventEmitter {
  _version: number
  _peer: Peer
  _status: FOURTWENTY.StatusMsg | null
  _peerStatus: FOURTWENTY.StatusMsg | null
  _statusTimeoutId: NodeJS.Timeout
  _send: SendMethod

  constructor(version: number, peer: Peer, send: SendMethod) {
    super()

    this._version = version
    this._peer = peer
    this._send = send

    this._status = null
    this._peerStatus = null
    this._statusTimeoutId = setTimeout(() => {
      this._peer.disconnect(DISCONNECT_REASONS.TIMEOUT)
    }, ms('5s'))
  }

  static fourtwenty62 = { name: 'fourtwenty', version: 62, length: 8, constructor: FOURTWENTY }
  static fourtwenty63 = { name: 'fourtwenty', version: 63, length: 17, constructor: FOURTWENTY }

  _handleMessage(code: FOURTWENTY.MESSAGE_CODES, data: any) {
    const payload = rlp.decode(data)
    if (code !== FOURTWENTY.MESSAGE_CODES.STATUS) {
      const debugMsg = `Received ${this.getMsgPrefix(code)} message from ${
        this._peer._socket.remoteAddress
      }:${this._peer._socket.remotePort}`
      const logData = formatLogData(data.toString('hex'), verbose)
      debug(`${debugMsg}: ${logData}`)
    }
    switch (code) {
      case FOURTWENTY.MESSAGE_CODES.STATUS:
        assertEq(this._peerStatus, null, 'Uncontrolled status message', debug)
        this._peerStatus = payload
        debug(
          `Received ${this.getMsgPrefix(code)} message from ${this._peer._socket.remoteAddress}:${
            this._peer._socket.remotePort
          }: : ${this._peerStatus ? this._getStatusString(this._peerStatus) : ''}`,
        )
        this._handleStatus()
        break

      case FOURTWENTY.MESSAGE_CODES.NEW_BLOCK_HASHES:
      case FOURTWENTY.MESSAGE_CODES.TX:
      case FOURTWENTY.MESSAGE_CODES.GET_BLOCK_HEADERS:
      case FOURTWENTY.MESSAGE_CODES.BLOCK_HEADERS:
      case FOURTWENTY.MESSAGE_CODES.GET_BLOCK_BODIES:
      case FOURTWENTY.MESSAGE_CODES.BLOCK_BODIES:
      case FOURTWENTY.MESSAGE_CODES.NEW_BLOCK:
        if (this._version >= FOURTWENTY.fourtwenty62.version) break
        return

      case FOURTWENTY.MESSAGE_CODES.GET_NODE_DATA:
      case FOURTWENTY.MESSAGE_CODES.NODE_DATA:
      case FOURTWENTY.MESSAGE_CODES.GET_RECEIPTS:
      case FOURTWENTY.MESSAGE_CODES.RECEIPTS:
        if (this._version >= FOURTWENTY.fourtwenty63.version) break
        return

      default:
        return
    }

    this.emit('message', code, payload)
  }

  _handleStatus(): void {
    if (this._status === null || this._peerStatus === null) return
    clearTimeout(this._statusTimeoutId)

    assertEq(this._status[0], this._peerStatus[0], 'Protocol version mismatch', debug)
    assertEq(this._status[1], this._peerStatus[1], 'NetworkId mismatch', debug)
    assertEq(this._status[4], this._peerStatus[4], 'Genesis block mismatch', debug)

    this.emit('status', {
      networkId: this._peerStatus[1],
      td: Buffer.from(this._peerStatus[2]),
      bestHash: Buffer.from(this._peerStatus[3]),
      genesisHash: Buffer.from(this._peerStatus[4]),
    })
  }

  getVersion() {
    return this._version
  }

  _getStatusString(status: FOURTWENTY.StatusMsg) {
    let sStr = `[V:${buffer2int(status[0])}, NID:${buffer2int(status[1])}, TD:${buffer2int(
      status[2],
    )}`
    sStr += `, BestH:${formatLogId(status[3].toString('hex'), verbose)}, GenH:${formatLogId(
      status[4].toString('hex'),
      verbose,
    )}]`
    return sStr
  }

  sendStatus(status: FOURTWENTY.Status) {
    if (this._status !== null) return
    this._status = [
      int2buffer(this._version),
      int2buffer(status.networkId),
      status.td,
      status.bestHash,
      status.genesisHash,
    ]

    debug(
      `Send STATUS message to ${this._peer._socket.remoteAddress}:${
        this._peer._socket.remotePort
      } (fourtwenty${this._version}): ${this._getStatusString(this._status)}`,
    )
    this._send(FOURTWENTY.MESSAGE_CODES.STATUS, rlp.encode(this._status))
    this._handleStatus()
  }

  sendMessage(code: FOURTWENTY.MESSAGE_CODES, payload: any) {
    const debugMsg = `Send ${this.getMsgPrefix(code)} message to ${
      this._peer._socket.remoteAddress
    }:${this._peer._socket.remotePort}`
    const logData = formatLogData(rlp.encode(payload).toString('hex'), verbose)
    debug(`${debugMsg}: ${logData}`)

    switch (code) {
      case FOURTWENTY.MESSAGE_CODES.STATUS:
        throw new Error('Please send status message through .sendStatus')

      case FOURTWENTY.MESSAGE_CODES.NEW_BLOCK_HASHES:
      case FOURTWENTY.MESSAGE_CODES.TX:
      case FOURTWENTY.MESSAGE_CODES.GET_BLOCK_HEADERS:
      case FOURTWENTY.MESSAGE_CODES.BLOCK_HEADERS:
      case FOURTWENTY.MESSAGE_CODES.GET_BLOCK_BODIES:
      case FOURTWENTY.MESSAGE_CODES.BLOCK_BODIES:
      case FOURTWENTY.MESSAGE_CODES.NEW_BLOCK:
        if (this._version >= FOURTWENTY.fourtwenty62.version) break
        throw new Error(`Code ${code} not allowed with version ${this._version}`)

      case FOURTWENTY.MESSAGE_CODES.GET_NODE_DATA:
      case FOURTWENTY.MESSAGE_CODES.NODE_DATA:
      case FOURTWENTY.MESSAGE_CODES.GET_RECEIPTS:
      case FOURTWENTY.MESSAGE_CODES.RECEIPTS:
        if (this._version >= FOURTWENTY.fourtwenty63.version) break
        throw new Error(`Code ${code} not allowed with version ${this._version}`)

      default:
        throw new Error(`Unknown code ${code}`)
    }

    this._send(code, rlp.encode(payload))
  }

  getMsgPrefix(msgCode: FOURTWENTY.MESSAGE_CODES): string {
    return FOURTWENTY.MESSAGE_CODES[msgCode]
  }
}

export namespace FOURTWENTY {
  export type StatusMsg = {
    0: Buffer
    1: Buffer
    2: Buffer
    3: Buffer
    4: Buffer
    length: 5
  }

  export type Status = {
    version: number
    networkId: number
    td: Buffer
    bestHash: Buffer
    genesisHash: Buffer
  }

  export enum MESSAGE_CODES {
    // fourtwenty62
    STATUS = 0x00,
    NEW_BLOCK_HASHES = 0x01,
    TX = 0x02,
    GET_BLOCK_HEADERS = 0x03,
    BLOCK_HEADERS = 0x04,
    GET_BLOCK_BODIES = 0x05,
    BLOCK_BODIES = 0x06,
    NEW_BLOCK = 0x07,

    // fourtwenty63
    GET_NODE_DATA = 0x0d,
    NODE_DATA = 0x0e,
    GET_RECEIPTS = 0x0f,
    RECEIPTS = 0x10,
  }
}
