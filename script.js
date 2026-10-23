"use strict";

const STORAGE_KEY = "intelligentDictionary.trie.v1";
const SAMPLE_WORDS = ["app", "apple", "application", "apply", "banana", "ball", "bat"];

function normalizeWord(value) {
  return value.trim().toLocaleLowerCase();
}

class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
    this.frequency = 0;
  }
}

class TrieDictionary {
  constructor() {
    this.root = new TrieNode();
    this.size = 0;
  }

  insert(input, frequency = 0) {
    const word = normalizeWord(input);
    if (!word) return false;
    let node = this.root;
    for (const character of word) {
      if (!node.children.has(character)) node.children.set(character, new TrieNode());
      node = node.children.get(character);
    }
    if (node.isEndOfWord) return false;
    node.isEndOfWord = true;
    node.frequency = Math.max(0, Number.isInteger(frequency) ? frequency : 0);
    this.size++;
    return true;
  }

  getNode(input) {
    let node = this.root;
    for (const character of normalizeWord(input)) {
      node = node.children.get(character);
      if (!node) return null;
    }
    return node;
  }

  contains(input) {
    const node = this.getNode(input);
    return Boolean(node && node.isEndOfWord);
  }

  search(input) {
    const node = this.getNode(input);
    if (!node || !node.isEndOfWord) return null;
    node.frequency++;
    return node.frequency;
  }

  delete(input) {
    const word = normalizeWord(input);
    if (!word) return false;
    const characters = Array.from(word);
    let deleted = false;
    const prune = (node, index) => {
      if (index === characters.length) {
        if (!node.isEndOfWord) return false;
        node.isEndOfWord = false;
        node.frequency = 0;
        deleted = true;
        return node.children.size === 0;
      }
      const character = characters[index];
      const child = node.children.get(character);
      if (!child) return false;
      if (prune(child, index + 1)) node.children.delete(character);
      return !node.isEndOfWord && node.children.size === 0;
    };
    prune(this.root, 0);
    if (deleted) this.size--;
    return deleted;
  }

  wordsWithPrefix(prefix = "") {
    const normalized = normalizeWord(prefix);
    const start = this.getNode(normalized);
    if (!start) return [];
    const results = [];
    const collect = (node, current) => {
      if (node.isEndOfWord) results.push({ word: current, frequency: node.frequency });
      for (const [character, child] of node.children) collect(child, current + character);
    };
    collect(start, normalized);
    return results;
  }

  allWords() {
    return this.wordsWithPrefix("");
  }
}

function loadDictionary() {
  const dictionary = new TrieDictionary();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const entries = JSON.parse(saved);
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (Array.isArray(entry) && typeof entry[0] === "string") dictionary.insert(entry[0], entry[1]);
        }
        return dictionary;
      }
    }
  } catch {
    // If browser storage is unavailable or malformed, start with the sample dictionary.
  }
  SAMPLE_WORDS.forEach((word) => dictionary.insert(word));
  return dictionary;
}

const dictionary = loadDictionary();
let sortMode = "alpha";
let activePrefix = "";

const searchInput = document.querySelector("#search-input");
const suggestionList = document.querySelector("#suggestion-list");
const searchFeedback = document.querySelector("#search-feedback");
const manageInput = document.querySelector("#manage-input");
const manageFeedback = document.querySelector("#manage-feedback");
const dictionaryFilter = document.querySelector("#dictionary-filter");

function saveDictionary() {
  try {
    const entries = dictionary.allWords().map(({ word, frequency }) => [word, frequency]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // The dictionary remains usable for this page session if storage is disabled.
  }
}

function sortWords(words) {
  return words.sort((a, b) => {
    if (sortMode === "frequency" && a.frequency !== b.frequency) return b.frequency - a.frequency;
    return a.word.localeCompare(b.word);
  });
}

function appendHighlightedWord(container, word, prefix) {
  if (!prefix || !word.startsWith(prefix)) {
    container.textContent = word;
    return;
  }
  const highlight = document.createElement("mark");
  highlight.textContent = word.slice(0, prefix.length);
  container.append(highlight, document.createTextNode(word.slice(prefix.length)));
}

function renderSuggestions(prefix = activePrefix) {
  activePrefix = normalizeWord(prefix);
  const matches = activePrefix ? sortWords(dictionary.wordsWithPrefix(activePrefix)) : [];
  document.querySelector("#prefix-label").textContent = activePrefix ? `Prefix “${activePrefix}”` : "Start with a prefix";
  document.querySelector("#suggestion-count").textContent = `${matches.length} ${matches.length === 1 ? "MATCH" : "MATCHES"}`;
  suggestionList.replaceChildren();

  if (!activePrefix) {
    const empty = document.createElement("div");
    empty.className = "suggestion-empty";
    empty.innerHTML = "Type a prefix to see matching words.<br><b>Try app, ba, or appl.</b>";
    suggestionList.append(empty);
    return;
  }
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "suggestion-empty";
    const message = document.createElement("span");
    message.textContent = `No suggestions for “${activePrefix}”. Add a word with this prefix to get started.`;
    empty.append(message);
    suggestionList.append(empty);
    return;
  }

  for (const entry of matches) {
    const row = document.createElement("button");
    row.className = "suggestion-row";
    row.type = "button";
    row.setAttribute("aria-label", `Search for ${entry.word}, searched ${entry.frequency} times`);
    const word = document.createElement("span");
    word.className = "suggestion-word";
    appendHighlightedWord(word, entry.word, activePrefix);
    const meta = document.createElement("span");
    meta.className = "suggestion-meta";
    meta.textContent = `${entry.frequency} ${entry.frequency === 1 ? "search" : "searches"}`;
    const arrow = document.createElement("span");
    arrow.className = "suggestion-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    row.append(word, meta, arrow);
    row.addEventListener("click", () => searchExact(entry.word));
    suggestionList.append(row);
  }
}

function renderStats() {
  const words = dictionary.allWords();
  const totalSearches = words.reduce((total, entry) => total + entry.frequency, 0);
  const popular = [...words].sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word))[0];
  document.querySelector("#stat-words").textContent = String(dictionary.size);
  document.querySelector("#stat-searches").textContent = String(totalSearches);
  document.querySelector("#stat-popular").textContent = popular && popular.frequency > 0 ? popular.word : "—";
}

function renderDictionary() {
  const tbody = document.querySelector("#word-list");
  const allWords = sortWords(dictionary.allWords());
  const query = normalizeWord(dictionaryFilter.value);
  const visibleWords = allWords.filter((entry) => entry.word.includes(query));
  tbody.replaceChildren();
  document.querySelector("#dictionary-count").textContent = `${visibleWords.length} ${visibleWords.length === 1 ? "word" : "words"}`;
  document.querySelector("#dictionary-empty").hidden = dictionary.size !== 0;
  document.querySelector("#filter-empty").hidden = !(dictionary.size > 0 && visibleWords.length === 0);

  for (const entry of visibleWords) {
    const row = document.createElement("tr");
    const wordCell = document.createElement("td");
    wordCell.textContent = entry.word;
    const frequencyCell = document.createElement("td");
    frequencyCell.textContent = String(entry.frequency);
    const actionCell = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${entry.word}`);
    remove.title = `Delete ${entry.word}`;
    remove.addEventListener("click", () => deleteWord(entry.word));
    actionCell.append(remove);
    row.append(wordCell, frequencyCell, actionCell);
    tbody.append(row);
  }
}

function render() {
  renderSuggestions();
  renderStats();
  renderDictionary();
}

function setFeedback(element, message, kind = "") {
  element.textContent = message;
  element.dataset.kind = kind;
}

function searchExact(input) {
  const word = normalizeWord(input);
  if (!word) {
    setFeedback(searchFeedback, "Enter a word or prefix to search.", "error");
    searchInput.focus();
    return;
  }
  searchInput.value = word;
  activePrefix = word;
  const frequency = dictionary.search(word);
  render();
  if (frequency !== null) {
    saveDictionary();
    setFeedback(searchFeedback, `“${word}” found · searched ${frequency} ${frequency === 1 ? "time" : "times"}.`, "success");
  } else {
    setFeedback(searchFeedback, `“${word}” is not a complete word in the dictionary. Add it with Word tools.`, "error");
  }
}

function addWord() {
  const word = normalizeWord(manageInput.value);
  if (!word) {
    setFeedback(manageFeedback, "Enter a word to add.", "error");
    manageInput.focus();
    return;
  }
  if (/\s/.test(word)) {
    setFeedback(manageFeedback, "Enter one word at a time, without spaces.", "error");
    manageInput.focus();
    return;
  }
  if (!dictionary.insert(word)) {
    setFeedback(manageFeedback, `“${word}” is already in the dictionary.`, "error");
    return;
  }
  saveDictionary();
  manageInput.value = "";
  render();
  setFeedback(manageFeedback, `Added “${word}” to the dictionary.`, "success");
}

function deleteWord(input) {
  const word = normalizeWord(input);
  if (!word) {
    setFeedback(manageFeedback, "Enter a word to delete.", "error");
    manageInput.focus();
    return;
  }
  if (!dictionary.delete(word)) {
    setFeedback(manageFeedback, `“${word}” was not found as a complete word.`, "error");
    return;
  }
  saveDictionary();
  render();
  setFeedback(manageFeedback, `Deleted “${word}” from the dictionary.`, "success");
}

searchInput.addEventListener("input", () => {
  activePrefix = normalizeWord(searchInput.value);
  renderSuggestions(activePrefix);
  setFeedback(searchFeedback, activePrefix ? "Choose a suggestion to record a search, or press Enter for an exact word." : "Type a prefix or try one of the examples below.");
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchExact(searchInput.value);
  }
});
document.querySelectorAll("[data-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    sortMode = button.dataset.sort;
    document.querySelectorAll("[data-sort]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    renderSuggestions();
    renderDictionary();
  });
});
document.querySelectorAll("[data-prefix]").forEach((button) => {
  button.addEventListener("click", () => {
    searchInput.value = button.dataset.prefix;
    activePrefix = normalizeWord(button.dataset.prefix);
    renderSuggestions(activePrefix);
    setFeedback(searchFeedback, `Showing words that start with “${activePrefix}”.`);
    searchInput.focus();
  });
});
document.querySelector("#add-button").addEventListener("click", addWord);
document.querySelector("#delete-button").addEventListener("click", () => deleteWord(manageInput.value));
manageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addWord();
  }
});
dictionaryFilter.addEventListener("input", renderDictionary);

render();
