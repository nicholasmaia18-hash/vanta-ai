"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const FAVORITES_KEY = "vanta_arcade_favorites";

const GAME_LIBRARY = [
  {
    id: "reaction",
    title: "Reaction Lab",
    category: "Skill",
    tag: "Fast hands",
    description: "Wait for the pulse, then click as fast as you can.",
  },
  {
    id: "memory",
    title: "Memory Grid",
    category: "Puzzle",
    tag: "Focus",
    description: "Match every pair with the fewest flips possible.",
  },
  {
    id: "number",
    title: "Number Sprint",
    category: "Puzzle",
    tag: "Sequence",
    description: "Tap the numbers in order before the timer gets away.",
  },
  {
    id: "target",
    title: "Target Pop",
    category: "Action",
    tag: "Precision",
    description: "Hit as many targets as you can in a short burst.",
  },
  {
    id: "typing",
    title: "Typing Dash",
    category: "Skill",
    tag: "Keyboard",
    description: "Type the line cleanly and see your speed.",
  },
];

const CATEGORIES = ["All", "Favorites", "Skill", "Puzzle", "Action"];
const INITIAL_MEMORY_CARDS = ["A", "B", "C", "D", "E", "F", "A", "B", "C", "D", "E", "F"].map(
  (value, index) => ({ id: `${value}-${index}`, value })
);

export default function ArcadeClient() {
  const [selectedGameId, setSelectedGameId] = useState(GAME_LIBRARY[0].id);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [favoriteIds, setFavoriteIds] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      if (Array.isArray(stored)) {
        return stored.filter((id) => typeof id === "string");
      }
    } catch {
      return [];
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds));
    } catch {
      // Favorites are a nice-to-have; the arcade still works without storage.
    }
  }, [favoriteIds]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return GAME_LIBRARY.filter((game) => {
      const matchesCategory =
        category === "All" ||
        game.category === category ||
        (category === "Favorites" && favoriteIds.includes(game.id));
      const matchesQuery =
        !normalizedQuery ||
        `${game.title} ${game.category} ${game.tag} ${game.description}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [category, favoriteIds, query]);

  const selectedGame =
    GAME_LIBRARY.find((game) => game.id === selectedGameId) || GAME_LIBRARY[0];

  function toggleFavorite(gameId) {
    setFavoriteIds((current) =>
      current.includes(gameId)
        ? current.filter((id) => id !== gameId)
        : [...current, gameId]
    );
  }

  function selectGame(gameId) {
    setSelectedGameId(gameId);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <main className="min-h-screen bg-[#05050a] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <aside className="border-b border-white/8 bg-[#0b0c12] px-4 py-5 lg:w-[320px] lg:border-b-0 lg:border-r lg:px-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/18 bg-violet-500/12 text-sm font-semibold text-violet-100">
                V
              </span>
              <span>
                <span className="block text-sm font-semibold">Vanta</span>
                <span className="block text-xs text-white/38">Arcade</span>
              </span>
            </Link>
            <Link
              href="/"
              className="rounded-[0.85rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-white/68 transition hover:bg-white/[0.08] hover:text-white"
            >
              Back
            </Link>
          </div>

          <div className="mt-6 rounded-[1.2rem] border border-white/8 bg-white/[0.025] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-violet-100/42">
              Arcade
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.06em]">
              Short games for quick breaks.
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/48">
              Original mini-games built into Vanta. No outside game sites, no
              copied assets, just quick focus breaks.
            </p>
          </div>

          <div className="mt-5">
            <label className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/32">
              Search games
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Reaction, typing, puzzle..."
              className="mt-2 w-full rounded-[0.95rem] border border-white/8 bg-[#101119] px-4 py-3 text-base text-white outline-none placeholder:text-white/28 focus:border-violet-300/28"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                  category === item
                    ? "border-violet-300/34 bg-violet-500/18 text-violet-50"
                    : "border-white/8 bg-white/[0.035] text-white/46 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3">
            {filteredGames.length === 0 ? (
              <div className="rounded-[1rem] border border-dashed border-white/10 px-4 py-5 text-sm text-white/40">
                No games match that search.
              </div>
            ) : (
              filteredGames.map((game) => (
                <GameListCard
                  key={game.id}
                  game={game}
                  active={selectedGame.id === game.id}
                  favorite={favoriteIds.includes(game.id)}
                  onSelect={() => selectGame(game.id)}
                  onFavorite={() => toggleFavorite(game.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col px-4 py-5 sm:px-6 lg:px-8">
          <div className="rounded-[1.6rem] border border-white/8 bg-[#0f1016] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.3)] sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-violet-100/42">
                  Now playing
                </p>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                  {selectedGame.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/48">
                  {selectedGame.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Pill label={selectedGame.category} />
                <Pill label={selectedGame.tag} />
                <button
                  type="button"
                  onClick={() => toggleFavorite(selectedGame.id)}
                  className="rounded-full border border-violet-300/18 bg-violet-500/10 px-4 py-2 text-sm text-violet-50 transition hover:bg-violet-500/16"
                >
                  {favoriteIds.includes(selectedGame.id) ? "Favorited" : "Favorite"}
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-[1.35rem] border border-white/8 bg-[#07070d] p-4 sm:p-5">
              <GameRenderer gameId={selectedGame.id} />
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <StatCard label="Games" value={GAME_LIBRARY.length} />
            <StatCard label="Saved" value={favoriteIds.length} />
            <StatCard label="Mode" value="Original" />
          </div>
        </section>
      </div>
    </main>
  );
}

function GameListCard({ game, active, favorite, onSelect, onFavorite }) {
  return (
    <article
      className={`rounded-[1rem] border p-3 transition ${
        active
          ? "border-violet-300/28 bg-violet-500/12"
          : "border-white/8 bg-white/[0.025] hover:bg-white/[0.045]"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold tracking-[-0.02em] text-white">
              {game.title}
            </h3>
            <p className="mt-1 text-xs text-white/38">{game.category} / {game.tag}</p>
          </div>
          <span className="rounded-full border border-white/8 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/34">
            Play
          </span>
        </div>
        <p className="mt-3 text-sm leading-5 text-white/46">{game.description}</p>
      </button>
      <button
        type="button"
        onClick={onFavorite}
        className="mt-3 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-xs text-white/52 transition hover:bg-white/[0.07] hover:text-white"
      >
        {favorite ? "Saved" : "Save"}
      </button>
    </article>
  );
}

function GameRenderer({ gameId }) {
  if (gameId === "reaction") return <ReactionLab />;
  if (gameId === "memory") return <MemoryGrid />;
  if (gameId === "number") return <NumberSprint />;
  if (gameId === "target") return <TargetPop />;
  return <TypingDash />;
}

function ReactionLab() {
  const timeoutRef = useRef(null);
  const startRef = useRef(0);
  const [phase, setPhase] = useState("idle");
  const [score, setScore] = useState(null);
  const [best, setBest] = useState(null);
  const [message, setMessage] = useState("Press start, wait for violet, then click.");

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function startRound() {
    clearTimeout(timeoutRef.current);
    setPhase("waiting");
    setScore(null);
    setMessage("Wait for it...");
    timeoutRef.current = setTimeout(() => {
      startRef.current = Date.now();
      setPhase("ready");
      setMessage("Click now.");
    }, 900 + Math.floor(Math.random() * 1800));
  }

  function handlePanelClick() {
    if (phase === "waiting") {
      clearTimeout(timeoutRef.current);
      setPhase("idle");
      setMessage("Too early. Reset and try again.");
      return;
    }

    if (phase === "ready") {
      const result = Date.now() - startRef.current;
      setScore(result);
      setBest((current) => (current === null ? result : Math.min(current, result)));
      setPhase("done");
      setMessage("Nice. Run it back when you are ready.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <button
        type="button"
        onClick={handlePanelClick}
        className={`min-h-[260px] rounded-[1.25rem] border p-6 text-left transition ${
          phase === "ready"
            ? "border-violet-300/34 bg-violet-500/22 shadow-[0_0_60px_rgba(168,85,247,0.22)]"
            : "border-white/8 bg-white/[0.025]"
        }`}
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/34">
          Reaction pad
        </p>
        <p className="mt-6 text-3xl font-semibold tracking-[-0.05em]">
          {message}
        </p>
        <p className="mt-4 text-sm text-white/42">
          Click inside this panel only when it changes.
        </p>
      </button>
      <GameControlPanel
        primaryLabel={phase === "waiting" ? "Waiting..." : "Start round"}
        onPrimary={startRound}
        disabled={phase === "waiting"}
        stats={[
          ["Last", score === null ? "n/a" : `${score} ms`],
          ["Best", best === null ? "n/a" : `${best} ms`],
        ]}
      />
    </div>
  );
}

function MemoryGrid() {
  const [cards, setCards] = useState(INITIAL_MEMORY_CARDS);
  const [openIds, setOpenIds] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);

  useEffect(() => {
    if (openIds.length !== 2) return;
    const [firstId, secondId] = openIds;
    const first = cards.find((card) => card.id === firstId);
    const second = cards.find((card) => card.id === secondId);

    const timer = setTimeout(() => {
      if (first?.value === second?.value) {
        setMatched((current) => [...current, firstId, secondId]);
      }
      setOpenIds([]);
    }, 650);

    return () => clearTimeout(timer);
  }, [cards, openIds]);

  function reset() {
    const values = ["A", "B", "C", "D", "E", "F"];
    const deck = shuffle(
      values.flatMap((value, index) => [
        { id: `${value}-1-${index}`, value },
        { id: `${value}-2-${index}`, value },
      ])
    );
    setCards(deck);
    setOpenIds([]);
    setMatched([]);
    setMoves(0);
  }

  function flip(cardId) {
    if (openIds.includes(cardId) || matched.includes(cardId) || openIds.length === 2) {
      return;
    }
    setOpenIds((current) => [...current, cardId]);
    if (openIds.length === 1) {
      setMoves((current) => current + 1);
    }
  }

  const complete = cards.length > 0 && matched.length === cards.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {cards.map((card) => {
          const visible = openIds.includes(card.id) || matched.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => flip(card.id)}
              className={`min-h-[92px] rounded-[1rem] border text-2xl font-semibold transition ${
                visible
                  ? "border-violet-300/28 bg-violet-500/18 text-white"
                  : "border-white/8 bg-white/[0.035] text-white/20 hover:bg-white/[0.06]"
              }`}
            >
              {visible ? card.value : ""}
            </button>
          );
        })}
      </div>
      <GameControlPanel
        primaryLabel="Shuffle"
        onPrimary={reset}
        stats={[
          ["Moves", moves],
          ["Pairs", `${matched.length / 2}/6`],
          ["Status", complete ? "Cleared" : "Playing"],
        ]}
      />
    </div>
  );
}

function NumberSprint() {
  const [numbers, setNumbers] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [nextNumber, setNextNumber] = useState(1);
  const [startedAt, setStartedAt] = useState(null);
  const [finishedMs, setFinishedMs] = useState(null);
  const [misses, setMisses] = useState(0);

  function reset() {
    setNumbers(shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    setNextNumber(1);
    setStartedAt(null);
    setFinishedMs(null);
    setMisses(0);
  }

  function tapNumber(value, event) {
    if (finishedMs !== null) return;
    const nowMs = event.timeStamp;
    const roundStart = startedAt || nowMs;

    if (startedAt === null) {
      setStartedAt(nowMs);
    }

    if (value !== nextNumber) {
      setMisses((current) => current + 1);
      return;
    }

    if (value === 12) {
      setFinishedMs(nowMs - roundStart);
      setNextNumber(13);
      return;
    }

    setNextNumber((current) => current + 1);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-4 rounded-[1rem] border border-white/8 bg-white/[0.025] px-4 py-3 text-sm text-white/54">
          Next number: <span className="text-white">{nextNumber > 12 ? "Done" : nextNumber}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {numbers.map((number) => (
            <button
              key={number}
              type="button"
              onClick={(event) => tapNumber(number, event)}
              className={`min-h-[82px] rounded-[1rem] border text-2xl font-semibold transition ${
                number < nextNumber
                  ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/70"
                  : "border-white/8 bg-white/[0.035] text-white hover:bg-violet-500/12"
              }`}
            >
              {number}
            </button>
          ))}
        </div>
      </div>
      <GameControlPanel
        primaryLabel="New board"
        onPrimary={reset}
        stats={[
          ["Time", finishedMs === null ? "n/a" : `${(finishedMs / 1000).toFixed(2)}s`],
          ["Misses", misses],
          ["Goal", "1 to 12"],
        ]}
      />
    </div>
  );
}

function TargetPop() {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState({ x: 42, y: 46 });

  useEffect(() => {
    if (!running) return undefined;

    const timer = setTimeout(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [running, timeLeft]);

  function start() {
    setScore(0);
    setTimeLeft(20);
    setRunning(true);
    moveTarget();
  }

  function moveTarget() {
    setTarget({
      x: 8 + Math.floor(Math.random() * 78),
      y: 10 + Math.floor(Math.random() * 72),
    });
  }

  function hitTarget() {
    if (!running) return;
    setScore((current) => current + 1);
    moveTarget();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="relative min-h-[320px] overflow-hidden rounded-[1.25rem] border border-white/8 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.12),transparent_45%),#080810]">
        <button
          type="button"
          onClick={hitTarget}
          disabled={!running}
          className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-100/40 bg-violet-400 shadow-[0_0_42px_rgba(168,85,247,0.42)] transition hover:scale-105 disabled:opacity-35"
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
          aria-label="Target"
        />
      </div>
      <GameControlPanel
        primaryLabel={running ? "Running..." : "Start"}
        onPrimary={start}
        disabled={running}
        stats={[
          ["Score", score],
          ["Time", `${timeLeft}s`],
          ["Status", running ? "Live" : "Ready"],
        ]}
      />
    </div>
  );
}

function TypingDash() {
  const phrases = [
    "Vanta keeps the workspace calm and focused.",
    "Small breaks can reset your attention.",
    "Clean tools make hard work feel lighter.",
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [completedMs, setCompletedMs] = useState(null);

  const phrase = phrases[phraseIndex];
  const complete = text === phrase;
  const elapsedMinutes = completedMs ? completedMs / 1000 / 60 : 0;
  const words = phrase.trim().split(/\s+/).length;
  const wpm = elapsedMinutes > 0 ? Math.round(words / elapsedMinutes) : 0;
  const accuracy = calculateAccuracy(text, phrase);

  function reset(next = false) {
    setText("");
    setStartedAt(null);
    setCompletedMs(null);
    if (next) {
      setPhraseIndex((current) => (current + 1) % phrases.length);
    }
  }

  function updateText(value) {
    const nowMs = Date.now();
    const startTime = startedAt || nowMs;

    if (!startedAt && value) {
      setStartedAt(nowMs);
    }
    setCompletedMs(value === phrase ? nowMs - startTime : null);
    setText(value);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.025] p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/32">
          Type this
        </p>
        <p className="mt-3 text-xl leading-8 text-white">{phrase}</p>
        <textarea
          value={text}
          onChange={(event) => updateText(event.target.value)}
          placeholder="Start typing here..."
          className="mt-5 min-h-[160px] w-full resize-none rounded-[1rem] border border-white/8 bg-[#080810] px-4 py-3 text-base leading-7 text-white outline-none placeholder:text-white/24 focus:border-violet-300/28"
        />
      </div>
      <GameControlPanel
        primaryLabel="Next phrase"
        onPrimary={() => reset(true)}
        secondaryLabel="Reset"
        onSecondary={() => reset(false)}
        stats={[
          ["Accuracy", `${accuracy}%`],
          ["WPM", complete ? wpm : "n/a"],
          ["Status", complete ? "Complete" : "Typing"],
        ]}
      />
    </div>
  );
}

function GameControlPanel({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  disabled,
  stats,
}) {
  return (
    <aside className="rounded-[1.15rem] border border-white/8 bg-white/[0.025] p-4">
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled}
        className="w-full rounded-[0.95rem] bg-gradient-to-br from-violet-500 to-fuchsia-600 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {primaryLabel}
      </button>
      {secondaryLabel ? (
        <button
          type="button"
          onClick={onSecondary}
          className="mt-2 w-full rounded-[0.95rem] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white/68 transition hover:bg-white/[0.08] hover:text-white"
        >
          {secondaryLabel}
        </button>
      ) : null}
      <dl className="mt-4 grid gap-2">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-[0.9rem] border border-white/8 bg-[#080810] px-3 py-2"
          >
            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/28">
              {label}
            </dt>
            <dd className="mt-1 text-sm text-white/74">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-[#0f1016] px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/28">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Pill({ label }) {
  return (
    <span className="rounded-full border border-white/8 bg-white/[0.035] px-4 py-2 text-sm text-white/62">
      {label}
    </span>
  );
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function calculateAccuracy(input, target) {
  if (!input.length) return 100;
  let correct = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === target[index]) correct += 1;
  }
  return Math.max(0, Math.round((correct / input.length) * 100));
}
