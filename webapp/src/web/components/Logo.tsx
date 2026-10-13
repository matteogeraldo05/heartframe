// Logo.tsx - the heart logo + "Heart Frame" wordmark (header and login page).
import "@fontsource/outfit/600.css";

import heart from "../assets/heart.png";

export function Logo() {
  return (
    <h1 className="logo">
      <img src={heart} alt="" width={40} height={40} />
      Heart Frame
    </h1>
  );
}
