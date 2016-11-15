const EventEmitter = require('events').EventEmitter
const WebSocketServer = require('ws').Server
const shortid = require('shortid')

class Server extends EventEmitter {
  constructor (options = {}) {
    super()

    this._localPeers = {}
    this._relay = options.relay || null
    this._options = options
  }

  start () {
    return new Promise((resolve, reject) => {
      this._server = new WebSocketServer(this._options)

      // Add event handlers
      this._server.on('connection', (peer) => this._onPeerConnection(peer))
      this._server.on('error', (error) => this._onServerError(error))

      // Wire the relay
      if (this._relay !== null) {
        this._relay.on('message', (peerId, data) => this._onRelayMessage(peerId, data))
      }
      return resolve()
    })
  }

  _onServerError (error) {
    this.emit('error', error)
  }

  _onPeerConnection (peer) {
    // Generate a peerId for this peer
    const peerId = peer.peerId = this._generatePeerId()

    // Add event handlers to peer
    peer.on('message', (data) => this._onPeerMessage(peer, data))
    // peer.on('error', (error) => this._onPeerError(peer, error))
    peer.on('close', (code, message) => this._onPeerClose(peer, code, message))

    // Notify peer of its id
    peer.send(JSON.stringify({
      type: 'id',
      peerId: peerId
    }))

    // Add the local peer to the relay
    if (this._relay !== null) {
      this.relay.addLocalPeerId(peerId)
    }

    this.emit('add_peer', peer)

    // Add the peer to the local peers list
    this._localPeers[peerId] = peer
  }

  // _onPeerError (peer, error) {
  //   // TODO
  // }

  _onPeerMessage (peer, data) {
    try {
      const msg = JSON.parse(data)
      if (msg.peerId) {
        if (this._isLocalPeer(msg.peerId)) {
          // It's a local peer
          this._localPeers[msg.peerId].send(data)
        } else if (this._relay !== null) {
          // We don't have this peer locally
          this._relay.relay(msg.peerId, data)
        } else {
          // TODO: Handle unkown peerIds
        }
      }
    } catch (error) { }
  }

  _onPeerClose (peer, code, message) {
    if (this._isLocalPeer(peer.peerId)) {
      // Remove the peer from the local peers list
      delete this._localPeers[peer.peerId]

      // If there is a relay, remove it there too
      if (this._relay !== null) {
        this._relay.removeLocalPeerId(peer.peerId)
      }

      this.emit('remove_peer', peer.peerId)
    }
  }

  _onRelayMessage (peerId, data) {
    if (this._isLocalPeer(peerId)) {
      // Send the data to the local peer
      this._localPeers[peerId].send(data)
    }
  }

  _generatePeerId () {
    // First check if a custom function was given
    if (this._options.generatePeerId && typeof this._options.generatePeerId === 'function') {
      return this._options.generatePeerId()
    }
    // If there is no custom function, use shortid to generate a peerId
    return shortid.generate()
  }

  _isLocalPeer (peerId) {
    return !!this._localPeers[peerId]
  }
}

exports = module.exports = Server