import './lib/zeppos/device-polyfill'
import { MessageBuilder } from './lib/zeppos/message'
import { ConfigStorage } from './lib/ConfigStorage'

const appId = 1107667
const messageBuilder = new MessageBuilder({ appId })
const config = new ConfigStorage()

App({
  globalData: {
    appId,
    messageBuilder,
    config,
  },

  onCreate() {
    messageBuilder.connect()
    config.load()
  },

  onDestroy() {
    messageBuilder.disConnect()
  }
})
