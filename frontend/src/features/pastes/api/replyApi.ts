import { apiClient } from '../../../lib/api-client/client';
import { CreateReplyPayload, EditReplyPayload, RepliesCursorPage, ReplyItem, ReplyVoteResult } from '../types/reply';

export interface ReplyQueryOptions {
  cursor?: string | null;
  limit?: number;
  token?: string;
  password?: string;
}

export interface ReplyMutationOptions {
  token?: string;
}

function clampReplyLimit(rawLimit?: number): number {
  if (rawLimit === undefined || rawLimit === null || Number.isNaN(rawLimit)) {
    return 20;
  }
  if (!Number.isFinite(rawLimit)) {
    return 50;
  }
  const intVal = Math.floor(rawLimit);
  return Math.max(1, Math.min(50, intVal));
}

function normalizeReply(reply: any): ReplyItem {
  if (!reply || typeof reply !== 'object') {
    return reply;
  }
  return {
    ...reply,
    parentReplyId: reply.parentReplyId !== undefined ? reply.parentReplyId : (reply.parent_reply_id ?? null),
    children: Array.isArray(reply.children) ? reply.children.map(normalizeReply) : [],
  };
}

export const replyApi = {
  getReplies: async (
    pasteId: string,
    cursorOrOptions?: string | null | ReplyQueryOptions,
    maybeLimit?: number
  ): Promise<RepliesCursorPage> => {
    let cursor: string | null | undefined = undefined;
    let limitVal: number = 20;
    let token: string | undefined = undefined;
    let password: string | undefined = undefined;

    if (cursorOrOptions !== null && typeof cursorOrOptions === 'object') {
      cursor = cursorOrOptions.cursor;
      limitVal = clampReplyLimit(cursorOrOptions.limit);
      token = cursorOrOptions.token;
      password = cursorOrOptions.password;
    } else {
      cursor = cursorOrOptions;
      limitVal = clampReplyLimit(maybeLimit);
    }

    const params: Record<string, string | number> = { limit: limitVal };
    if (cursor !== undefined && cursor !== null && String(cursor).trim() !== '') {
      params.cursor = cursor;
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers['X-Share-Token'] = token;
    }
    if (password) {
      headers['X-Paste-Password'] = password;
    }

    const config = {
      params,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };

    const response = await apiClient.get<RepliesCursorPage>(
      `/pastes/${encodeURIComponent(pasteId)}/replies`,
      config
    );
    return {
      ...response.data,
      items: Array.isArray(response.data?.items)
        ? response.data.items.map(normalizeReply)
        : [],
    };
  },

  createReply: async (
    pasteId: string,
    payload: CreateReplyPayload,
    options?: ReplyMutationOptions
  ): Promise<ReplyItem> => {
    const headers: Record<string, string> = {};
    if (options?.token) {
      headers['X-Share-Token'] = options.token;
    }

    const parentId = payload.parentReplyId !== undefined ? payload.parentReplyId : payload.parent_reply_id;
    const body: Record<string, unknown> = {
      content: payload.content,
    };
    if (parentId !== undefined && parentId !== null) {
      body.parent_reply_id = parentId;
    }

    const config = Object.keys(headers).length > 0 ? { headers } : undefined;
    const response = await apiClient.post<ReplyItem>(
      `/pastes/${encodeURIComponent(pasteId)}/replies`,
      body,
      config
    );
    return normalizeReply(response.data);
  },

  editReply: async (replyId: number, payload: EditReplyPayload): Promise<ReplyItem> => {
    const response = await apiClient.patch<ReplyItem>(`/replies/${encodeURIComponent(String(replyId))}`, payload);
    return normalizeReply(response.data);
  },

  deleteReply: async (replyId: number): Promise<void> => {
    await apiClient.delete(`/replies/${encodeURIComponent(String(replyId))}`);
  },

  voteReply: async (pasteId: string, replyId: number, voteType: 'UP' | 'DOWN'): Promise<ReplyVoteResult> => {
    const response = await apiClient.post<ReplyVoteResult>(
      `/pastes/${encodeURIComponent(pasteId)}/replies/${encodeURIComponent(String(replyId))}/vote`,
      { voteType }
    );
    return response.data;
  },

  retractReplyVote: async (pasteId: string, replyId: number): Promise<ReplyVoteResult> => {
    const response = await apiClient.delete<ReplyVoteResult>(
      `/pastes/${encodeURIComponent(pasteId)}/replies/${encodeURIComponent(String(replyId))}/vote`
    );
    return response.data;
  },
};
