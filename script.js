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

function getInitials(text) {
  if (!text) return "EX";
  return text
    .split(/[\s@&-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function createExperienceCard(experience, index) {
  const card = document.createElement("a");
  card.className = "project-card";
  card.href = experience.profileUrl || "https://www.linkedin.com/in/briansawaya/";
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.style.setProperty("--i", index.toString());

  const media = document.createElement("figure");
  media.className = "experience-media";

  const image = document.createElement("img");
  image.src = experience.logoUrl || "";
  image.alt = experience.company
    ? `${experience.company} logo`
    : "Company logo";
  image.loading = "lazy";
  image.decoding = "async";

  const fallback = document.createElement("div");
  fallback.className = "logo-fallback";
  fallback.textContent = getInitials(experience.company);
  fallback.hidden = false;

  image.addEventListener("load", () => {
    fallback.hidden = true;
  });

  image.addEventListener("error", () => {
    fallback.hidden = false;
  });

  media.append(image, fallback);

  const copy = document.createElement("div");
  copy.className = "project-copy";

  const company = document.createElement("span");
  company.className = "project-title";
  company.textContent = experience.company || "Experience";

  const role = document.createElement("p");
  role.className = "experience-role";
  role.textContent = experience.role || "";

  const dates = document.createElement("div");
  dates.className = "experience-dates";
  dates.textContent = experience.period || "";

  copy.append(company, role, dates);
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

async function renderExperiences() {
  const grid = document.getElementById("experience-grid");
  if (!grid) return;

  try {
    const response = await fetch("experiences.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
    const experiences = await response.json();

    const validExperiences = (experiences || []).filter(
      (experience) => experience && experience.company && experience.role,
    );

    if (!validExperiences.length) {
      grid.innerHTML = "<p>No experience found.</p>";
      return;
    }

    validExperiences.forEach((experience, index) => {
      grid.appendChild(createExperienceCard(experience, index));
    });
  } catch (error) {
    console.error(error);
    grid.innerHTML = "<p>Could not load experience right now.</p>";
  }
}

renderProjects();
renderExperiences();
