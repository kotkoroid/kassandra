import * as Schema from 'effect/Schema';

export const ChatChannel = Schema.Literals(['Normal', 'Global', 'Group']);

export const SimEvent = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('create_character'),
    name: Schema.String,
    sex: Schema.Literals(['male', 'female']),
    hairColor: Schema.Literals(['black', 'brown', 'blonde', 'red', 'gray', 'white']),
    armor: Schema.Literals([
      'silver',
      'gold',
      'black',
      'brown',
      'red',
      'green',
      'blue',
      'white',
    ]),
    playerClass: Schema.Literals(['warrior', 'assassin', 'mage', 'bruiser']),
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
]);

export type ChatChannel = typeof ChatChannel.Type;
export type SimEvent = typeof SimEvent.Type;
