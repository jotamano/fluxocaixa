import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Vite ships the markdown source with the bundle as a static string. This
// keeps the docs page working in fully-offline self-host deployments.
import indexMd from "../../docs/README.md?raw";
import funcionalidadesMd from "../../docs/funcionalidades.md?raw";
import ivaMd from "../../docs/iva.md?raw";
import membrosMd from "../../docs/membros.md?raw";
import auditoriaMd from "../../docs/auditoria.md?raw";
import lixoMd from "../../docs/lixo-90-dias.md?raw";
import operadorMd from "../../docs/operador.md?raw";

type DocEntry = {
  slug: string;
  title: string;
  description: string;
  content: string;
};

const docs: DocEntry[] = [
  {
    slug: "indice",
    title: "Índice",
    description: "Mapa da documentação e visão geral.",
    content: indexMd,
  },
  {
    slug: "funcionalidades",
    title: "Funcionalidades",
    description: "Guia página-a-página de toda a app.",
    content: funcionalidadesMd,
  },
  {
    slug: "iva",
    title: "IVA",
    description: "Como o IVA é calculado e mostrado em toda a app.",
    content: ivaMd,
  },
  {
    slug: "membros",
    title: "Membros",
    description: "Convidar, gerir e revogar funcionários.",
    content: membrosMd,
  },
  {
    slug: "auditoria",
    title: "Auditoria",
    description: "Histórico imutável de tudo o que cada membro faz.",
    content: auditoriaMd,
  },
  {
    slug: "lixo",
    title: "Lixo (90 dias)",
    description: "Soft-delete, cascata e auto-purga ao fim de 90 dias.",
    content: lixoMd,
  },
  {
    slug: "operador",
    title: "Operador",
    description: "Arquitetura, migrations, pg_cron, troubleshooting.",
    content: operadorMd,
  },
];

const docsBySlug = new Map(docs.map((d) => [d.slug, d]));

export default function Docs() {
  const { slug } = useParams<{ slug?: string }>();
  const active = useMemo(() => docsBySlug.get(slug ?? "indice") ?? docs[0], [slug]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Documentação</h1>
        <p className="text-muted-foreground">
          Guia completo da app — para utilizadores e operadores. Em
          português (pt-PT).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-1 lg:sticky lg:top-4 lg:self-start">
          {docs.map((doc) => {
            const isActive = doc.slug === active.slug;
            return (
              <Link
                key={doc.slug}
                to={`/docs/${doc.slug}`}
                className={cn(
                  "block rounded-lg border px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <div className="font-medium text-foreground">{doc.title}</div>
                <div className="text-xs text-muted-foreground">{doc.description}</div>
              </Link>
            );
          })}
        </nav>

        <article className="docs-prose min-w-0 rounded-lg border bg-card p-6 shadow-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ node: _node, ...props }) => (
                <h1 className="mb-4 mt-0 text-2xl font-bold tracking-tight" {...props} />
              ),
              h2: ({ node: _node, ...props }) => (
                <h2 className="mb-3 mt-8 text-xl font-semibold tracking-tight" {...props} />
              ),
              h3: ({ node: _node, ...props }) => (
                <h3 className="mb-2 mt-6 text-lg font-semibold" {...props} />
              ),
              h4: ({ node: _node, ...props }) => (
                <h4 className="mb-2 mt-4 text-base font-semibold" {...props} />
              ),
              p: ({ node: _node, ...props }) => (
                <p className="my-3 leading-relaxed text-foreground/90" {...props} />
              ),
              ul: ({ node: _node, ...props }) => (
                <ul className="my-3 list-disc space-y-1 pl-6 text-foreground/90" {...props} />
              ),
              ol: ({ node: _node, ...props }) => (
                <ol className="my-3 list-decimal space-y-1 pl-6 text-foreground/90" {...props} />
              ),
              li: ({ node: _node, ...props }) => <li className="leading-relaxed" {...props} />,
              a: ({ node: _node, href, ...props }) => {
                const internal = rewriteDocLink(href);
                return internal ? (
                  <Link
                    to={internal}
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                    {...props}
                  />
                ) : (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                    {...props}
                  />
                );
              },
              code: ({ node: _node, className, children, ...props }) => {
                const isBlock = /language-/.test(className ?? "");
                if (isBlock) {
                  return (
                    <code
                      className={cn(
                        "block whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed",
                        className,
                      )}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre: ({ node: _node, ...props }) => (
                <pre
                  className="my-4 overflow-x-auto rounded-md border bg-muted/40 p-0 text-xs"
                  {...props}
                />
              ),
              blockquote: ({ node: _node, ...props }) => (
                <blockquote
                  className="my-4 border-l-4 border-primary/40 bg-muted/40 px-4 py-2 italic text-foreground/80"
                  {...props}
                />
              ),
              table: ({ node: _node, ...props }) => (
                <div className="my-4 w-full overflow-x-auto">
                  <table className="w-full border-collapse text-sm" {...props} />
                </div>
              ),
              th: ({ node: _node, ...props }) => (
                <th
                  className="border border-border bg-muted px-2 py-1 text-left font-semibold"
                  {...props}
                />
              ),
              td: ({ node: _node, ...props }) => (
                <td className="border border-border px-2 py-1 align-top" {...props} />
              ),
              hr: ({ node: _node, ...props }) => (
                <hr className="my-6 border-border" {...props} />
              ),
              strong: ({ node: _node, ...props }) => (
                <strong className="font-semibold text-foreground" {...props} />
              ),
            }}
          >
            {active.content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}

// Rewrite relative links between markdown files so navigation stays inside
// the SPA. Anything else (http/https/anchors/file paths) bubbles up as a
// regular external link.
function rewriteDocLink(href: string | undefined): string | null {
  if (!href) return null;
  if (/^[a-z]+:\/\//i.test(href)) return null;
  if (href.startsWith("mailto:")) return null;
  if (href.startsWith("/")) return null;

  // ./README.md, README.md, ./funcionalidades.md, etc.
  const cleaned = href.replace(/^\.\//, "").replace(/^\.\.\//, "");
  const [path, hash] = cleaned.split("#");
  const base = path.replace(/\.md$/i, "");

  let slug: string | null = null;
  if (base === "" || base === "README") slug = "indice";
  else if (base === "lixo-90-dias") slug = "lixo";
  else if (docsBySlug.has(base)) slug = base;

  if (!slug) return null;
  return hash ? `/docs/${slug}#${hash}` : `/docs/${slug}`;
}
