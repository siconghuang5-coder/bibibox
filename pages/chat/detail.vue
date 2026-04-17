<template>
  <view class="page page-chat-detail">
    <view class="header">
      <text class="header-action" @tap="goBack">‹</text>
      <view class="header-main" v-if="conversation">
        <text class="header-title">{{ conversation.digitalHuman.displayName }}</text>
        <text class="header-sub">{{ conversation.digitalHuman.tagline }}</text>
      </view>
      <text class="header-action" @tap="refreshConversation">刷新</text>
    </view>

    <scroll-view
      scroll-y
      class="scroll"
      :show-scrollbar="false"
      :scroll-top="scrollTop"
      scroll-with-animation
    >
      <view class="message-list">
        <view
          class="message-row"
          :class="{ self: item.role === 'USER' }"
          v-for="item in messages"
          :key="item.id"
        >
          <image
            class="message-avatar"
            :src="resolveAssetUrl(item.sender?.avatarUrl || fallbackAvatar(item.role))"
            mode="aspectFill"
          />
          <view class="message-bubble" :class="{ self: item.role === 'USER' }">
            <text v-if="item.textContent" class="message-text">{{ item.textContent }}</text>
            <image v-if="item.messageType === 'IMAGE' && item.mediaUrl" class="message-image" :src="item.mediaUrl" mode="widthFix" />
            <view v-if="item.messageType === 'AUDIO'" class="message-audio">
              <text class="audio-label">语音消息</text>
              <text class="audio-text">{{ item.transcription || '未提供语音摘要' }}</text>
              <audio v-if="item.mediaUrl" :src="item.mediaUrl" controls></audio>
            </view>
            <text class="message-time">{{ formatDateTime(item.createdAt) }}</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="draft-chip" v-if="audioDraft.path">
      <text class="draft-chip-text">已录制语音，发送时会附带下方文字作为摘要</text>
      <text class="draft-chip-action" @tap="clearAudioDraft">清除</text>
    </view>

    <view class="composer">
      <textarea
        v-model="draft"
        class="composer-input"
        auto-height
        maxlength="600"
        placeholder="发消息给数字人，也可以写语音摘要"
        placeholder-class="composer-placeholder"
      />
      <view class="composer-actions">
        <view class="tool-btn" @tap="chooseImage">图片</view>
        <view class="tool-btn" @tap="toggleRecord">{{ isRecording ? '停止' : '语音' }}</view>
        <view class="send-btn" @tap="sendCurrent">发送</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { request, resolveAssetUrl, uploadFile } from '../../utils/api.js'
import { refreshTabBadges } from '../../utils/badges.js'
import { formatDateTime } from '../../utils/format.js'

const conversationId = ref('')
const conversation = ref(null)
const messages = ref([])
const draft = ref('')
const scrollTop = ref(999999)
const isRecording = ref(false)
const audioDraft = ref({
  path: '',
  durationSeconds: 0
})

let pollTimer = null
let recorderManager = null

const fallbackAvatar = (role) => {
  return role === 'USER' ? '/static/default.png' : '/static/xiaomei.jpg'
}

const bindRecorder = () => {
  if (recorderManager || typeof uni.getRecorderManager !== 'function') {
    return
  }

  recorderManager = uni.getRecorderManager()
  recorderManager.onStop((result) => {
    isRecording.value = false
    audioDraft.value = {
      path: result.tempFilePath,
      durationSeconds: Math.round((result.duration || 0) / 1000)
    }
    uni.showToast({ title: '语音已录制', icon: 'none' })
  })
  recorderManager.onError((error) => {
    isRecording.value = false
    console.error('[chat:recorder]', error)
    uni.showToast({ title: '录音失败', icon: 'none' })
  })
}

const refreshConversation = async () => {
  if (!conversationId.value) return
  try {
    const response = await request({
      url: `/api/chat/conversations/${conversationId.value}`
    })
    conversation.value = response.conversation || null
    messages.value = response.messages || []
    scrollTop.value = 999999
    await request({
      url: `/api/chat/conversations/${conversationId.value}/read`,
      method: 'POST',
      data: {}
    })
    await refreshTabBadges()
  } catch (error) {
    console.error('[chat:refreshConversation]', error)
    uni.showToast({ title: '会话加载失败', icon: 'none' })
  }
}

const sendPayload = async (payload) => {
  await request({
    url: `/api/chat/conversations/${conversationId.value}/messages`,
    method: 'POST',
    data: payload
  })
  draft.value = ''
  clearAudioDraft()
  await refreshConversation()
}

const sendCurrent = async () => {
  if (audioDraft.value.path) {
    try {
      const uploaded = await uploadFile({
        url: '/api/chat/uploads/audio',
        filePath: audioDraft.value.path
      })
      await sendPayload({
        messageType: 'AUDIO',
        mediaUrl: uploaded.url,
        mediaMimeType: uploaded.mimeType,
        durationSeconds: audioDraft.value.durationSeconds,
        transcription: draft.value.trim()
      })
    } catch (error) {
      console.error('[chat:sendAudio]', error)
      uni.showToast({ title: '语音发送失败', icon: 'none' })
    }
    return
  }

  if (!draft.value.trim()) {
    uni.showToast({ title: '先写点内容吧', icon: 'none' })
    return
  }

  try {
    await sendPayload({
      messageType: 'TEXT',
      textContent: draft.value.trim()
    })
  } catch (error) {
    console.error('[chat:sendText]', error)
    uni.showToast({ title: '发送失败', icon: 'none' })
  }
}

const chooseImage = async () => {
  try {
    const chooser = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: resolve,
        fail: reject
      })
    })
    const filePath = chooser.tempFilePaths?.[0]
    if (!filePath) return
    const uploaded = await uploadFile({
      url: '/api/chat/uploads/image',
      filePath
    })
    await sendPayload({
      messageType: 'IMAGE',
      mediaUrl: uploaded.url,
      mediaMimeType: uploaded.mimeType,
      textContent: draft.value.trim() || undefined
    })
  } catch (error) {
    if (String(error?.errMsg || error).includes('cancel')) return
    console.error('[chat:chooseImage]', error)
    uni.showToast({ title: '图片发送失败', icon: 'none' })
  }
}

const toggleRecord = () => {
  bindRecorder()
  if (!recorderManager) {
    uni.showToast({ title: '当前环境不支持录音', icon: 'none' })
    return
  }

  if (isRecording.value) {
    recorderManager.stop()
    return
  }

  clearAudioDraft()
  isRecording.value = true
  recorderManager.start({
    duration: 60000,
    format: 'mp3'
  })
}

const clearAudioDraft = () => {
  audioDraft.value = {
    path: '',
    durationSeconds: 0
  }
}

const goBack = () => {
  uni.navigateBack({
    delta: 1
  })
}

const startPolling = () => {
  stopPolling()
  pollTimer = setInterval(() => {
    refreshConversation()
  }, 8000)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onLoad((options) => {
  conversationId.value = options?.id || ''
})

onShow(() => {
  bindRecorder()
  refreshConversation()
  startPolling()
})

onHide(() => {
  stopPolling()
})

onUnload(() => {
  stopPolling()
  if (recorderManager && isRecording.value) {
    recorderManager.stop()
  }
})
</script>

<style scoped>
.page-chat-detail {
  min-height: 100vh;
  background: #f6f7f8;
}

.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  height: 96rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1rpx solid #e5e7eb;
}

.header-main {
  flex: 1;
  padding: 0 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header-title {
  font-size: 28rpx;
  font-weight: 700;
}

.header-sub {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #9ca3af;
}

.header-action {
  min-width: 72rpx;
  font-size: 24rpx;
  color: #36a4f2;
}

.scroll {
  height: calc(100vh - 320rpx);
  padding-top: 96rpx;
}

.message-list {
  padding: 24rpx 24rpx 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.message-row.self {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 999rpx;
  background: #e5e7eb;
  flex-shrink: 0;
}

.message-bubble {
  max-width: 520rpx;
  border-radius: 24rpx;
  padding: 18rpx 20rpx;
  background: #ffffff;
  box-shadow: 0 12rpx 24rpx rgba(15, 23, 42, 0.05);
}

.message-bubble.self {
  background: #36a4f2;
}

.message-text,
.audio-text {
  font-size: 24rpx;
  line-height: 1.7;
  color: #334155;
}

.message-bubble.self .message-text {
  color: #ffffff;
}

.message-image {
  width: 360rpx;
  border-radius: 18rpx;
}

.message-audio {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.audio-label {
  font-size: 22rpx;
  color: #36a4f2;
}

.message-time {
  display: block;
  margin-top: 10rpx;
  font-size: 18rpx;
  color: #94a3b8;
}

.message-bubble.self .message-time {
  color: rgba(255, 255, 255, 0.75);
}

.draft-chip {
  margin: 16rpx 24rpx 0;
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: rgba(54, 164, 242, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.draft-chip-text {
  flex: 1;
  font-size: 22rpx;
  color: #36a4f2;
}

.draft-chip-action {
  margin-left: 16rpx;
  font-size: 22rpx;
  color: #ef4444;
}

.composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 24rpx 30rpx;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1rpx solid #e5e7eb;
}

.composer-input {
  width: 100%;
  min-height: 88rpx;
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  background: #f3f4f6;
  font-size: 24rpx;
  box-sizing: border-box;
}

.composer-placeholder {
  color: #9ca3af;
}

.composer-actions {
  margin-top: 16rpx;
  display: flex;
  gap: 12rpx;
}

.tool-btn,
.send-btn {
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  text-align: center;
  font-size: 24rpx;
}

.tool-btn {
  flex: 1;
  background: #f3f4f6;
  color: #475569;
}

.send-btn {
  min-width: 180rpx;
  background: #36a4f2;
  color: #ffffff;
}
</style>
