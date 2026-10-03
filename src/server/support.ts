import "server-only";
import { db } from "./db";
import { rateLimit } from "./rate-limit";
import { notify } from "./notify/notifications";
import { sendEmail, simpleNoticeEmail } from "./notify/email";
import type { TicketStatus, User } from "@/generated/prisma/client";

/**
 * Customer support: tickets and live chat share one model (a chat is a ticket
 * with channel CHAT). Customers can only ever reach their own tickets; every
 * query below is scoped by userId. Staff access goes through admin RBAC.
 */

export const SUPPORT_CATEGORIES = [
  "Account & login",
  "Verification (KYC)",
  "Deposits",
  "Withdrawals",
  "Trading",
  "Security",
  "Other",
] as const;

export const MAX_MESSAGE = 4000;
const MESSAGES_PER_WINDOW = { limit: 30, window: 600 };
const TICKETS_PER_DAY = { limit: 10, window: 86_400 };

export class SupportError extends Error {}

async function limitMessages(userId: string) {
  const rl = await rateLimit(`support:msg:${userId}`, MESSAGES_PER_WINDOW.limit, MESSAGES_PER_WINDOW.window);
  if (!rl.ok) throw new SupportError("You're sending messages too quickly. Please wait a few minutes.");
}

function cleanBody(body: string): string {
  const b = body.replace(/\r\n/g, "\n").trim();
  if (!b) throw new SupportError("Write a message first.");
  if (b.length > MAX_MESSAGE) throw new SupportError(`Keep messages under ${MAX_MESSAGE} characters.`);
  return b;
}

export async function createTicket(userId: string, input: { subject: string; category: string; body: string }) {
  const body = cleanBody(input.body);
  const rl = await rateLimit(`support:ticket:${userId}`, TICKETS_PER_DAY.limit, TICKETS_PER_DAY.window);
  if (!rl.ok) throw new SupportError("You've opened a lot of tickets today. Reply on an existing one or try tomorrow.");
  await limitMessages(userId);
  return db.supportTicket.create({
    data: {
      userId,
      subject: input.subject,
      category: input.category,
      messages: { create: { authorId: userId, body } },
    },
  });
}

/** Customer reply. Reopens a resolved ticket; closed tickets are read-only. */
export async function customerReply(userId: string, ticketId: string, rawBody: string) {
  const ticket = await db.supportTicket.findFirst({ where: { id: ticketId, userId } });
  if (!ticket) throw new SupportError("Ticket not found.");
  if (ticket.status === "CLOSED") throw new SupportError("This conversation is closed. Start a new one if you still need help.");
  const body = cleanBody(rawBody);
  await limitMessages(userId);
  const now = new Date();
  await db.$transaction([
    db.supportMessage.create({ data: { ticketId, authorId: userId, body } }),
    db.supportTicket.update({ where: { id: ticketId }, data: { status: "OPEN", lastMessageAt: now } }),
  ]);
}

// ---------------------------------------------------------------------------
// Live chat
// ---------------------------------------------------------------------------

/** The customer's current (not resolved/closed) chat, if any. */
export function activeChat(userId: string) {
  return db.supportTicket.findFirst({
    where: { userId, channel: "CHAT", status: { in: ["OPEN", "AWAITING_CUSTOMER"] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function chatMessages(userId: string, since?: Date) {
  const chat = await activeChat(userId);
  if (!chat) return { chatId: null, messages: [] };
  const messages = await db.supportMessage.findMany({
    where: { ticketId: chat.id, ...(since ? { createdAt: { gt: since } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, body: true, fromStaff: true, createdAt: true, author: { select: { name: true } } },
  });
  return {
    chatId: chat.id,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      fromStaff: m.fromStaff,
      // Staff are shown by first name only.
      author: m.fromStaff ? m.author.name.split(/\s+/)[0] : "You",
      at: m.createdAt.toISOString(),
    })),
  };
}

export async function sendChatMessage(userId: string, rawBody: string) {
  const body = cleanBody(rawBody);
  const chat = await activeChat(userId);
  if (chat) return customerReply(userId, chat.id, body);
  await createTicketForChat(userId, body);
}

async function createTicketForChat(userId: string, body: string) {
  await limitMessages(userId);
  await db.supportTicket.create({
    data: {
      userId,
      channel: "CHAT",
      subject: body.length > 60 ? `${body.slice(0, 57)}...` : body,
      category: "Chat",
      messages: { create: { authorId: userId, body } },
    },
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function staffReply(staff: Pick<User, "id">, ticketId: string, rawBody: string) {
  const body = cleanBody(rawBody);
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId }, include: { user: { select: { email: true } } } });
  if (!ticket) throw new SupportError("Ticket not found.");
  await db.$transaction([
    db.supportMessage.create({ data: { ticketId, authorId: staff.id, fromStaff: true, body } }),
    db.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: ticket.status === "CLOSED" ? "CLOSED" : "AWAITING_CUSTOMER",
        lastMessageAt: new Date(),
        assignedToId: ticket.assignedToId ?? staff.id,
      },
    }),
  ]);
  const link = ticket.channel === "CHAT" ? "/support?chat=1" : `/support/${ticket.id}`;
  await notify(ticket.userId, { type: "ACCOUNT", title: "Support replied", body: `New reply on "${ticket.subject}".`, link }).catch(() => {});
  // Chats are answered live; email only for tickets. The email never includes the message itself.
  if (ticket.channel === "TICKET")
    await sendEmail(
      simpleNoticeEmail(ticket.user.email, "You have a reply from Trade In Orbit support", "Our support team replied to your ticket. Sign in to read it.", link, "Read the reply"),
    ).catch(() => {});
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  await db.supportTicket.update({ where: { id: ticketId }, data: { status } });
}

export async function assignTicket(ticketId: string, staffId: string | null) {
  await db.supportTicket.update({ where: { id: ticketId }, data: { assignedToId: staffId } });
}
