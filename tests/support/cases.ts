/**
 * Case fixtures for integration tests.
 *
 * Tests that *run* a case must never run a seeded one. Analysing a case
 * rewrites its recommendation, quote, approvals and status, so a test that
 * points `runAdaptiveRequest` at REQ-2041 leaves the demo case in whatever
 * state that test's scripted model produced — and every later assertion
 * against REQ-2041, in this file or another, is then reading someone else's
 * leftovers. Because Vitest orders files by recorded duration rather than by
 * name, which test wins is not even stable.
 *
 * So: clone the seeded case, run the clone, delete it afterwards. The copy
 * carries the same customer, site, contact, subject and body, so the pricing,
 * freight, history and compatibility it exercises are all the real ones.
 */

import type { PrismaClient } from "@/generated/prisma";

/** Drop the primary key and parent link so a row can be re-created elsewhere. */
function stripKeys<T extends { id: string; requestId: string }>(row: T): Omit<T, "id" | "requestId"> {
  const { id, requestId, ...rest } = row;
  void id;
  void requestId;
  return rest;
}

export class CaseTracker {
  private readonly ids: string[] = [];

  constructor(private readonly db: PrismaClient) {}

  /**
   * Copy a seeded case so the original is never analysed by a test.
   *
   * The extracted requirements and line items come across too. They are
   * extraction output rather than customer input, but a test that probes the
   * MCP layer directly never runs extraction, and a case with no requirements
   * would make every compatibility and quantity check vacuous.
   */
  async clone(reference: string): Promise<string> {
    const source = await this.db.salesRequest.findFirstOrThrow({
      where: { reference },
      include: { requirements: true, items: true },
    });
    const copy = await this.db.salesRequest.create({
      data: {
        reference: `${reference}-CLONE-${Date.now().toString(36)}-${this.ids.length}`,
        subject: source.subject,
        rawBody: source.rawBody,
        receivedAt: source.receivedAt,
        channel: source.channel,
        summary: source.summary,
        requiredBy: source.requiredBy,
        customerId: source.customerId,
        siteId: source.siteId,
        contactId: source.contactId,
        ownerId: source.ownerId,
        requirements: { create: source.requirements.map(stripKeys) },
        items: { create: source.items.map(stripKeys) },
      },
    });
    this.ids.push(copy.id);
    return copy.id;
  }

  /** Create a throwaway case against a real account. */
  async create(
    prefix: string,
    subject: string,
    body: string,
    accountNumber = "ACC-10044",
  ): Promise<string> {
    const customer = await this.db.customer.findFirstOrThrow({
      where: { accountNumber },
      include: { sites: true, contacts: true },
    });
    const owner = await this.db.user.findFirstOrThrow({ where: { role: "SALES_REP" } });
    const request = await this.db.salesRequest.create({
      data: {
        reference: `${prefix}-${Date.now().toString(36)}-${this.ids.length}`,
        subject,
        rawBody: body,
        receivedAt: new Date(),
        customerId: customer.id,
        siteId: customer.sites[0]?.id ?? null,
        contactId: customer.contacts[0]?.id ?? null,
        ownerId: owner.id,
      },
    });
    this.ids.push(request.id);
    return request.id;
  }

  /** Remove everything this tracker created. Cascades clear the child rows. */
  async cleanup(): Promise<void> {
    if (this.ids.length === 0) return;
    await this.db.salesRequest.deleteMany({ where: { id: { in: this.ids.splice(0) } } });
  }
}
