import { ChatApp } from "@carbo/chat";

// O <ChatProvider> vive no Layout (cobre a sidebar/badge e esta página).
// -m compensa o padding do <main> para o chat ocupar a área toda.
export default function Chat() {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)]">
      <ChatApp />
    </div>
  );
}
