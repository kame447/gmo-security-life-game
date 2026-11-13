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

The runtime model and codec follow this type-first commit. Phone integration
must load `saved.chat` and return `chat.save()` from `PhoneModel.save()`; updating
the shared codec alone cannot add chat to a model that builds its own save DTO.
The added `PhoneSave.chat` field will remain optional for legacy callers.

Contact names, messages, limits and reply delays are provisional review data.
There is no external service, AI conversation, real account or chosen storyline.
