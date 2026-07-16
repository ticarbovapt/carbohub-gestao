import { ChatApp } from "@carbo/chat";

// O <ChatProvider> vive no Layout (cobre a sidebar/badge e esta página).
export default function Chat() {
  return (
    <div className="h-full min-h-0">
      <ChatApp />
    </div>
  );
}
