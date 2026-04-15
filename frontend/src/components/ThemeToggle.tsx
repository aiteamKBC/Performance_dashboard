import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") {
      setIsLight(true);
      document.documentElement.classList.add("light-mode");
    }
  }, []);

  const toggle = () => {
    if (isLight) {
      document.documentElement.classList.remove("light-mode");
      localStorage.setItem("theme", "dark");
      setIsLight(false);
    } else {
      document.documentElement.classList.add("light-mode");
      localStorage.setItem("theme", "light");
      setIsLight(true);
    }
  };

  return (
    <button 
      onClick={toggle} 
      className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-white/50 hover:text-white" 
      title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
    >
      {isLight ? <i className="ri-moon-fill text-lg"></i> : <i className="ri-sun-fill text-lg"></i>}
    </button>
  );
}
