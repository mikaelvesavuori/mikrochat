/**
 * @description Centralized application state.
 * This module exports mutable state that can be imported and modified by other modules.
 */
import { LRUMap } from './lru.mjs';

export const state = {
  currentChannelForEdit: null,
  currentUser: null,
  currentChannelId: null,
  messageEventSource: null,
  currentMessageForReaction: null,
  currentMessageForReactionIsDM: false,
  currentMessageForEdit: null,
  currentMessageForEditIsDM: false,
  currentMessageForEditContent: '',
  currentMessageForEditImages: [],
  isStorageInitialized: false,
  pendingUploads: [],
  tempIdMap: new Map(),
  messageCache: new LRUMap(2000),
  unreadCounts: new Map(),
  storage: null,
  // Direct Messages state
  currentConversationId: null,
  conversationCache: new LRUMap(200),
  dmMessageCache: new LRUMap(2000),
  dmUnreadCounts: new Map(),
  viewMode: 'channel', // 'channel' or 'dm'
  // Thread state
  currentThreadId: null,
  threadMessageCache: new LRUMap(500),
  threadPanelOpen: false,
  currentMessageForEditIsThread: false,
  // Network state
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false
};
