import type { TelegramOutgoingAction, TelegramReplyMarkup, TelegramWebhookEnv } from './types';

export interface TelegramBotClient {
  sendMessage(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean): Promise<void>;
}

export function createTelegramBotClient(env: TelegramWebhookEnv): TelegramBotClient {
  const baseUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

  return {
    async sendMessage(chatId, text, replyMarkup) {
      await telegramApiRequest(baseUrl, 'sendMessage', {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
      });
    },
    async answerCallbackQuery(callbackQueryId, text, showAlert) {
      await telegramApiRequest(baseUrl, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      });
    },
  };
}

export async function executeTelegramActions(client: TelegramBotClient, actions: TelegramOutgoingAction[]): Promise<void> {
  for (const action of actions) {
    if (action.kind === 'sendMessage') {
      await client.sendMessage(action.chatId, action.text, action.replyMarkup);
      continue;
    }

    await client.answerCallbackQuery(action.callbackQueryId, action.text, action.showAlert);
  }
}

async function telegramApiRequest(baseUrl: string, method: string, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${baseUrl}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Telegram API ${method} failed: ${response.status} ${details}`.trim());
  }
}

