function ellipsize(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}...`;
}

function createCard(project, index) {
  const card = document.createElement("a");
  card.className = "project-card";
  card.href = project.notionUrl || "#";
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.style.setProperty("--i", index.toString());

  const media = document.createElement("figure");
  media.className = "project-media";

  const image = document.createElement("img");
  image.src = project.imageUrl || "";
  image.alt = project.title ? `${project.title} preview` : "Project preview";
  image.loading = "lazy";
  image.decoding = "async";

  image.addEventListener("error", () => {
    image.style.opacity = "0";
  });

  media.appendChild(image);

  const copy = document.createElement("div");
  copy.className = "project-copy";

  const title = document.createElement("span");
  title.className = "project-title";
  title.textContent = project.title || "Untitled Project";

  const meta = document.createElement("div");
  meta.className = "project-meta";
  meta.textContent = project.collection || "Project";

  const desc = document.createElement("p");
  desc.className = "project-desc";
  desc.textContent = ellipsize(project.description || "", 150);

  copy.append(title, meta, desc);
  card.append(media, copy);
  return card;
}

async function renderProjects() {
  const grid = document.getElementById("project-grid");
  if (!grid) return;

  try {
    const response = await fetch("projects.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
    const projects = await response.json();

    const validProjects = (projects || []).filter(
      (project) => project && project.title && project.imageUrl,
    );

    if (!validProjects.length) {
      grid.innerHTML = "<p>No projects found.</p>";
      return;
    }

    validProjects.forEach((project, index) => {
      grid.appendChild(createCard(project, index));
    });
  } catch (error) {
    console.error(error);
    grid.innerHTML = "<p>Could not load projects right now.</p>";
  }
}

renderProjects();
