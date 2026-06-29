import { TableClient } from "@azure/data-tables";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// 사용자별 이메일 구독 저장소 (Azure Table Storage)
//   PartitionKey = slot (morning/evening) → cron이 슬롯별로 효율 조회
//   RowKey       = 구독 id (uuid)
// ─────────────────────────────────────────────────────────────────────────────

export type Slot = "morning" | "evening";

export interface Subscription {
  id: string;
  slot: Slot;
  email: string;
  /** "" 이면 전국 */
  region: string;
  /** "any" | "dog" | "cat" | "other" */
  species: string;
  token: string;
  createdAt: string;
}

const TABLE_NAME = "subscriptions";

function getClient(): TableClient {
  const conn = process.env.SUBSCRIPTIONS_TABLE_CONN;
  if (!conn) throw new Error("SUBSCRIPTIONS_TABLE_CONN 미설정");
  return TableClient.fromConnectionString(conn, TABLE_NAME);
}

export async function addSubscription(input: {
  email: string;
  region: string;
  species: string;
  slot: Slot;
}): Promise<Subscription> {
  const id = randomUUID();
  const token = randomUUID().replace(/-/g, "");
  const createdAt = new Date().toISOString();

  await getClient().createEntity({
    partitionKey: input.slot,
    rowKey: id,
    email: input.email,
    region: input.region,
    species: input.species,
    token,
    createdAt,
  });

  return { id, slot: input.slot, email: input.email, region: input.region, species: input.species, token, createdAt };
}

export async function listBySlot(slot: Slot): Promise<Subscription[]> {
  const client = getClient();
  const out: Subscription[] = [];
  const entities = client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${slot}'` },
  });
  for await (const e of entities) {
    out.push({
      id: String(e.rowKey),
      slot: String(e.partitionKey) as Slot,
      email: String(e.email ?? ""),
      region: String(e.region ?? ""),
      species: String(e.species ?? "any"),
      token: String(e.token ?? ""),
      createdAt: String(e.createdAt ?? ""),
    });
  }
  return out;
}

/** 해지: id + token 일치해야 삭제 (남의 구독 임의 해지 방지) */
export async function removeSubscription(
  slot: Slot,
  id: string,
  token: string
): Promise<boolean> {
  const client = getClient();
  try {
    const e = await client.getEntity(slot, id);
    if (String(e.token) !== token) return false;
    await client.deleteEntity(slot, id);
    return true;
  } catch {
    return false;
  }
}
