const prototype = document.querySelector(".prototype");
const stateButtons = [...document.querySelectorAll("[data-state]")].filter(
  (element) => element.classList.contains("review-chip"),
);

function setState(state) {
  prototype.dataset.state = state;
  stateButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.state === state);
  });
}

stateButtons.forEach((button) => {
  button.addEventListener("click", () => setState(button.dataset.state));
});

document.querySelectorAll("[data-round-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest(".round-section")?.classList.toggle("is-collapsed");
  });
});

const pauseButton = document.getElementById("pauseButton");
let paused = false;
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.innerHTML = paused
    ? '<svg><use href="#i-play"></use></svg><span>继续</span>'
    : '<svg><use href="#i-pause"></use></svg><span>暂停</span>';
  document.querySelector(".status-live").innerHTML = paused
    ? "<i></i>已暂停"
    : "<i></i>讨论中";
});

document.getElementById("stopButton").addEventListener("click", () => {
  setState("completed");
});

document.getElementById("openResult").addEventListener("click", () => {
  setState("completed");
});

document.querySelectorAll(".result-nav").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.target);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll(".result-nav").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});

document.getElementById("returnButton").addEventListener("click", () => {
  document.querySelector(".conversation").animate(
    [
      { backgroundColor: "#26302a" },
      { backgroundColor: "#1a1d20" },
    ],
    { duration: 520, easing: "ease-out" },
  );
});

const guidanceInput = document.getElementById("guidanceInput");
const guidanceSent = document.getElementById("guidanceSent");
document.getElementById("guidanceSend").addEventListener("click", () => {
  const text = guidanceInput.value.trim();
  if (!text) {
    guidanceInput.focus();
    return;
  }
  guidanceSent.querySelector("span").textContent = `已排入下一轮：${text}`;
  guidanceSent.classList.add("visible");
  guidanceInput.value = "";
});
