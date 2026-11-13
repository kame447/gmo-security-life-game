# Local chat API

`ChatModel(content, saved?)` implements `ChatApi` from `types.ts`. The UI owns
the selected thread and input draft. Returned lists and saves are deep copies.

- `sendMessage(threadId, text, atMs)` adds the outgoing bubble synchronously.
  Check `PhoneModel.networkAllowed` before calling it.
- `advance(elapsedPlayingMs, atMs)` delivers scheduled fixed replies separately.
  Supply active play time only; pause, hidden pages and offline time do not count.
  The prototype reply delay lives in the content data, not a real-time timer.
- `deliverMessage(threadId, {id, from, text, atMs})` is the future NPC/event entry.
  `from` must equal the thread contact ID. IDs deduplicate retained history.
- `markRead(threadId)` marks incoming messages read. UI navigation is not saved.
- `onChange` fires after visible mutations, not countdown ticks. A phone adapter
  should forward it to its change/save signal without replacing the input node.
- `save()` includes bounded history, contact metadata, reply cursor and pending
  delays. `parseChatSave` is clock-free and also usable without any phone UI.

`model.ts` implements the runtime and `codec.ts` the shared save codec. Phone integration
must load `saved.chat` and return `chat.save()` from `PhoneModel.save()`; updating
the shared codec alone cannot add chat to a model that builds its own save DTO.
The added `PhoneSave.chat` field will remain optional for legacy callers.

`CHAT_PROTOTYPE` in `data/chat-prototype.ts` supplies three review contacts and
500 ms replies. No script reply is invented after its ordered lines run out.
Sending while a reply queue is full fails without appending a partial send.

The codec limits history to 40 messages and 4 pending replies per thread, 16
contacts/threads, 280 code points per message and 256 KiB of UTF-8 JSON for the
whole chat field. It removes C0/C1 control characters and keeps HTML literal.
Oldest history is discarded to fit the byte cap; the newest message of each
thread is preferred before older messages. Retained IDs deduplicate events;
there is no permanent event ledger after bounded history is discarded.

The frozen bag `53d1f1c` and shop `435560b` builds still have the old codec:
normal load/save **drops an unknown chat field**. Their `review=1` previews
avoid reading or writing saves. Those branches remain unchanged while their UI
is under review; integration must use the new shared codec before normal use
with chat saves. With this codec their DTO-only Game implementations retain
chat without loading PhoneModel or phone UI.

`node tests/phone-chat-cross-build.mjs <bag/game> <shop/game>` verifies both
facts against the actual Game/loadSave/writeSave of frozen checkouts. It
bundles in memory, first with each original codec, then substituting only the
current shared codec. It uses only in-memory localStorage and edits neither
checkout. This is a staged integration check, not a claim those remote branches
already include the new codec.

Contact names, messages, limits and reply delays are provisional review data.
There is no external service, AI conversation, real account or chosen storyline.
