import test from 'tape'
import * as devp2p from '../../src'
import * as util from './util'

const CHAIN_ID = 1

const GENESIS_TD = 17179869184
const GENESIS_HASH = Buffer.from(
  'd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
  'hex',
)

var capabilities = [devp2p.FOURTWENTY.fourtwenty63, devp2p.FOURTWENTY.fourtwenty62]

const status = {
  networkId: CHAIN_ID,
  td: devp2p.int2buffer(GENESIS_TD),
  bestHash: GENESIS_HASH,
  genesisHash: GENESIS_HASH,
}

// FIXME: Handle unhandled promises directly
process.on('unhandledRejection', (reason, p) => {})

test('FOURTWENTY: send status message (successful)', async t => {
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  opts.status1 = Object.assign({}, status)
  opts.onOnceStatus0 = function(rlpxs: any, fourtwenty: any) {
    t.pass('should receive echoing status message and welcome connection')
    util.destroyRLPXs(rlpxs)
    t.end()
  }
  util.twoPeerMsgExchange(t, capabilities, opts)
})

test('FOURTWENTY: send status message (NetworkId mismatch)', async t => {
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  let status1 = Object.assign({}, status)
  status1['networkId'] = 2
  opts.status1 = status1
  opts.onPeerError0 = function(err: Error, rlpxs: any) {
    const msg = 'NetworkId mismatch: 01 / 02'
    t.equal(err.message, msg, `should emit error: ${msg}`)
    util.destroyRLPXs(rlpxs)
    t.end()
  }
  util.twoPeerMsgExchange(t, capabilities, opts)
})

test('FOURTWENTY: send status message (Genesis block mismatch)', async t => {
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  let status1 = Object.assign({}, status)
  status1['genesisHash'] = Buffer.alloc(32)
  opts.status1 = status1
  opts.onPeerError0 = function(err: Error, rlpxs: any) {
    const msg =
      'Genesis block mismatch: d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3 / 0000000000000000000000000000000000000000000000000000000000000000'
    t.equal(err.message, msg, `should emit error: ${msg}`)
    util.destroyRLPXs(rlpxs)
    t.end()
  }
  util.twoPeerMsgExchange(t, capabilities, opts)
})

test('FOURTWENTY: send allowed fourtwenty63', async t => {
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  opts.status1 = Object.assign({}, status)
  opts.onOnceStatus0 = function(rlpxs: any, fourtwenty: any) {
    t.equal(fourtwenty.getVersion(), 63, 'should use fourtwenty63 as protocol version')
    fourtwenty.sendMessage(devp2p.FOURTWENTY.MESSAGE_CODES.NEW_BLOCK_HASHES, [437000, 1, 0, 0])
    t.pass('should send NEW_BLOCK_HASHES message')
  }
  opts.onOnMsg1 = function(rlpxs: any, fourtwenty: any, code: any, payload: any) {
    if (code === devp2p.FOURTWENTY.MESSAGE_CODES.NEW_BLOCK_HASHES) {
      t.pass('should receive NEW_BLOCK_HASHES message')
      util.destroyRLPXs(rlpxs)
      t.end()
    }
  }
  util.twoPeerMsgExchange(t, capabilities, opts)
})

test('FOURTWENTY: send allowed fourtwenty62', async t => {
  let cap = [devp2p.FOURTWENTY.fourtwenty62]
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  opts.status1 = Object.assign({}, status)
  opts.onOnceStatus0 = function(rlpxs: any, fourtwenty: any) {
    fourtwenty.sendMessage(devp2p.FOURTWENTY.MESSAGE_CODES.NEW_BLOCK_HASHES, [437000, 1, 0, 0])
    t.pass('should send NEW_BLOCK_HASHES message')
  }
  opts.onOnMsg1 = function(rlpxs: any, fourtwenty: any, code: any, payload: any) {
    if (code === devp2p.FOURTWENTY.MESSAGE_CODES.NEW_BLOCK_HASHES) {
      t.pass('should receive NEW_BLOCK_HASHES message')
      util.destroyRLPXs(rlpxs)
      t.end()
    }
  }
  util.twoPeerMsgExchange(t, cap, opts)
})

test('FOURTWENTY: send not-allowed fourtwenty62', async t => {
  let cap = [devp2p.FOURTWENTY.fourtwenty62]
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  opts.status1 = Object.assign({}, status)
  opts.onOnceStatus0 = function(rlpxs: any, fourtwenty: any) {
    try {
      fourtwenty.sendMessage(devp2p.FOURTWENTY.MESSAGE_CODES.GET_NODE_DATA, [])
    } catch (err) {
      const msg = 'Error: Code 13 not allowed with version 62'
      t.equal(err.toString(), msg, `should emit error: ${msg}`)
      util.destroyRLPXs(rlpxs)
      t.end()
    }
  }
  util.twoPeerMsgExchange(t, cap, opts)
})

test('FOURTWENTY: send unknown message code', async t => {
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  opts.status1 = Object.assign({}, status)
  opts.onOnceStatus0 = function(rlpxs: any, fourtwenty: any) {
    try {
      fourtwenty.sendMessage(0x55, [])
    } catch (err) {
      const msg = 'Error: Unknown code 85'
      t.equal(err.toString(), msg, `should emit error: ${msg}`)
      util.destroyRLPXs(rlpxs)
      t.end()
    }
  }
  util.twoPeerMsgExchange(t, capabilities, opts)
})

test('FOURTWENTY: invalid status send', async t => {
  let opts: any = {}
  opts.status0 = Object.assign({}, status)
  opts.status1 = Object.assign({}, status)
  opts.onOnceStatus0 = function(rlpxs: any, fourtwenty: any) {
    try {
      fourtwenty.sendMessage(devp2p.FOURTWENTY.MESSAGE_CODES.STATUS, [])
    } catch (err) {
      const msg = 'Error: Please send status message through .sendStatus'
      t.equal(err.toString(), msg, `should emit error: ${msg}`)
      util.destroyRLPXs(rlpxs)
      t.end()
    }
  }
  util.twoPeerMsgExchange(t, capabilities, opts)
})
