import { writable } from 'svelte/store';

// Active chat / session state
export const chatId = writable('');
export const chatTitle = writable('');

export const channels = writable([]);
export const chats = writable([]);
export const pinnedChats = writable([]);
export const tags = writable([]);

export const temporaryChatEnabled = writable(false);
export const scrollPaginationEnabled = writable(false);
export const currentChatPage = writable(1);
