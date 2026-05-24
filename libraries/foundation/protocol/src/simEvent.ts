import * as Schema from 'effect/Schema';

export const ChatChannel = Schema.Union([
  Schema.Literal('Normal'),
  Schema.Literal('Global'),
  Schema.Literal('Group'),
]);

export const SimEvent = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('create_character'),
    name: Schema.String,
    sex: Schema.Union([Schema.Literal('male'), Schema.Literal('female')]),
    hairColor: Schema.Union([
      Schema.Literal('black'),
      Schema.Literal('brown'),
      Schema.Literal('blonde'),
      Schema.Literal('red'),
      Schema.Literal('gray'),
      Schema.Literal('white'),
    ]),
    armor: Schema.Union([
      Schema.Literal('silver'),
      Schema.Literal('gold'),
      Schema.Literal('black'),
      Schema.Literal('brown'),
      Schema.Literal('red'),
      Schema.Literal('green'),
      Schema.Literal('blue'),
      Schema.Literal('white'),
    ]),
    playerClass: Schema.Union([
      Schema.Literal('warrior'),
      Schema.Literal('assassin'),
      Schema.Literal('mage'),
      Schema.Literal('bruiser'),
    ]),
  }),
  Schema.Struct({ kind: Schema.Literal('click_ground'), x: Schema.Number, z: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal('engage'), targetId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('manual_attack') }),
  Schema.Struct({ kind: Schema.Literal('send_chat'), text: Schema.String, channel: ChatChannel }),
  Schema.Struct({ kind: Schema.Literal('request_respawn') }),
  Schema.Struct({ kind: Schema.Literal('set_auto_attack'), on: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal('kill_player') }),
  Schema.Struct({ kind: Schema.Literal('pickup_loot'), bagId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('drop_item'), itemId: Schema.String, count: Schema.Number }),
  Schema.Struct({
    kind: Schema.Literal('cast_spell'),
    spellId: Schema.String,
    targetId: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  // Spend one classSpellPoint to raise this spell's level by 1.
  // Server validates: spell exists for the player's class, pool > 0,
  // current level < MAX_SPELL_LEVEL.
  Schema.Struct({
    kind: Schema.Literal('level_up_spell'),
    spellId: Schema.String,
  }),
  // Party-owner-only: ask the realm to tear down the party. Server
  // verifies sender === ownerId, then broadcasts ServerMessage 'disbanded'
  // and closes every socket. Non-owner senders are silently ignored.
  Schema.Struct({ kind: Schema.Literal('disband_party') }),
]);

export type ChatChannel = typeof ChatChannel.Type;
export type SimEvent = typeof SimEvent.Type;
