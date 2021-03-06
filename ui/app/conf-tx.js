const inherits = require('util').inherits
const Component = require('react').Component
const ReactCSSTransitionGroup = require('react-addons-css-transition-group')
const h = require('react-hyperscript')
const connect = require('react-redux').connect
const actions = require('./actions')
const NetworkIndicator = require('./components/network')
const txHelper = require('../lib/tx-helper')
const isPopupOrNotification = require('../../app/scripts/lib/is-popup-or-notification')
const ethUtil = require('ethereumjs-util')
const BN = ethUtil.BN

const PendingTx = require('./components/pending-tx')
const PendingMsg = require('./components/pending-msg')
const PendingPersonalMsg = require('./components/pending-personal-msg')
const Loading = require('./components/loading')

module.exports = connect(mapStateToProps)(ConfirmTxScreen)

function mapStateToProps (state) {
  return {
    identities: state.metamask.identities,
    accounts: state.metamask.accounts,
    selectedAddress: state.metamask.selectedAddress,
    unapprovedTxs: state.metamask.unapprovedTxs,
    unapprovedMsgs: state.metamask.unapprovedMsgs,
    unapprovedPersonalMsgs: state.metamask.unapprovedPersonalMsgs,
    index: state.appState.currentView.context,
    warning: state.appState.warning,
    network: state.metamask.network,
    provider: state.metamask.provider,
  }
}

inherits(ConfirmTxScreen, Component)
function ConfirmTxScreen () {
  Component.call(this)
}

ConfirmTxScreen.prototype.render = function () {
  const props = this.props
  const { network, provider, unapprovedTxs,
    unapprovedMsgs, unapprovedPersonalMsgs } = props

  var unconfTxList = txHelper(unapprovedTxs, unapprovedMsgs, unapprovedPersonalMsgs, network)
  var index = props.index !== undefined && unconfTxList[index] ? props.index : 0
  var txData = unconfTxList[index] || {}
  var txParams = txData.params || {}
  var isNotification = isPopupOrNotification() === 'notification'

  log.info(`rendering a combined ${unconfTxList.length} unconf msg & txs`)
  if (unconfTxList.length === 0) return h(Loading)

  return (

    h('.flex-column.flex-grow', [

      // subtitle and nav
      h('.section-title.flex-row.flex-center', [
        !isNotification ? h('i.fa.fa-arrow-left.fa-lg.cursor-pointer', {
          onClick: this.goHome.bind(this),
        }) : null,
        h('h2.page-subtitle', 'Confirm Transaction'),
        isNotification ? h(NetworkIndicator, {
          network: network,
          provider: provider,
        }) : null,
      ]),

      h('h3', {
        style: {
          alignSelf: 'center',
          display: unconfTxList.length > 1 ? 'block' : 'none',
        },
      }, [
        h('i.fa.fa-arrow-left.fa-lg.cursor-pointer', {
          style: {
            display: props.index === 0 ? 'none' : 'inline-block',
          },
          onClick: () => props.dispatch(actions.previousTx()),
        }),
        ` ${props.index + 1} of ${unconfTxList.length} `,
        h('i.fa.fa-arrow-right.fa-lg.cursor-pointer', {
          style: {
            display: props.index + 1 === unconfTxList.length ? 'none' : 'inline-block',
          },
          onClick: () => props.dispatch(actions.nextTx()),
        }),
      ]),

      warningIfExists(props.warning),

      h(ReactCSSTransitionGroup, {
        className: 'css-transition-group',
        transitionName: 'main',
        transitionEnterTimeout: 300,
        transitionLeaveTimeout: 300,
      }, [

        currentTxView({
          // Properties
          txData: txData,
          key: txData.id,
          selectedAddress: props.selectedAddress,
          accounts: props.accounts,
          identities: props.identities,
          insufficientBalance: this.checkBalanceAgainstTx(txData),
          // State actions
          onTxChange: this.onTxChange.bind(this),
          // Actions
          buyEth: this.buyEth.bind(this, txParams.from || props.selectedAddress),
          sendTransaction: this.sendTransaction.bind(this, txData),
          cancelTransaction: this.cancelTransaction.bind(this, txData),
          signMessage: this.signMessage.bind(this, txData),
          signPersonalMessage: this.signPersonalMessage.bind(this, txData),
          cancelMessage: this.cancelMessage.bind(this, txData),
          cancelPersonalMessage: this.cancelPersonalMessage.bind(this, txData),
        }),

      ]),
    ])
  )
}

function currentTxView (opts) {
  log.info('rendering current tx view')
  const { txData } = opts
  const { txParams, msgParams, type } = txData

  if (txParams) {
    log.debug('txParams detected, rendering pending tx')
    return h(PendingTx, opts)

  } else if (msgParams) {
    log.debug('msgParams detected, rendering pending msg')

    if (type === 'eth_sign') {
      log.debug('rendering eth_sign message')
      return h(PendingMsg, opts)

    } else if (type === 'personal_sign') {
      log.debug('rendering personal_sign message')
      return h(PendingPersonalMsg, opts)
    }
  }
}

ConfirmTxScreen.prototype.checkBalanceAgainstTx = function (txData) {
  if (!txData.txParams) return false
  var props = this.props
  var address = txData.txParams.from || props.selectedAddress
  var account = props.accounts[address]
  var balance = account ? account.balance : '0x0'
  var maxCost = new BN(txData.maxCost, 16)

  var balanceBn = new BN(ethUtil.stripHexPrefix(balance), 16)
  return maxCost.gt(balanceBn)
}

ConfirmTxScreen.prototype.buyEth = function (address, event) {
  event.stopPropagation()
  this.props.dispatch(actions.buyEthView(address))
}

// Allows the detail view to update the gas calculations,
// for manual gas controls.
ConfirmTxScreen.prototype.onTxChange = function (txData) {
  log.debug(`conf-tx onTxChange triggered with ${JSON.stringify(txData)}`)
  this.setState({ txData })
}

// Must default to any local state txData,
// to allow manual override of gas calculations.
ConfirmTxScreen.prototype.sendTransaction = function (txData, event) {
  event.stopPropagation()
  const state = this.state || {}
  const txMeta = state.txData
  this.props.dispatch(actions.updateAndApproveTx(txMeta || txData))
}

ConfirmTxScreen.prototype.cancelTransaction = function (txData, event) {
  event.stopPropagation()
  this.props.dispatch(actions.cancelTx(txData))
}

ConfirmTxScreen.prototype.signMessage = function (msgData, event) {
  log.info('conf-tx.js: signing message')
  var params = msgData.msgParams
  params.metamaskId = msgData.id
  event.stopPropagation()
  this.props.dispatch(actions.signMsg(params))
}

ConfirmTxScreen.prototype.signPersonalMessage = function (msgData, event) {
  log.info('conf-tx.js: signing personal message')
  var params = msgData.msgParams
  params.metamaskId = msgData.id
  event.stopPropagation()
  this.props.dispatch(actions.signPersonalMsg(params))
}

ConfirmTxScreen.prototype.cancelMessage = function (msgData, event) {
  log.info('canceling message')
  event.stopPropagation()
  this.props.dispatch(actions.cancelMsg(msgData))
}

ConfirmTxScreen.prototype.cancelPersonalMessage = function (msgData, event) {
  log.info('canceling personal message')
  event.stopPropagation()
  this.props.dispatch(actions.cancelPersonalMsg(msgData))
}

ConfirmTxScreen.prototype.goHome = function (event) {
  event.stopPropagation()
  this.props.dispatch(actions.goHome())
}

function warningIfExists (warning) {
  if (warning &&
     // Do not display user rejections on this screen:
     warning.indexOf('User denied transaction signature') === -1) {
    return h('.error', {
      style: {
        margin: 'auto',
      },
    }, warning)
  }
}
