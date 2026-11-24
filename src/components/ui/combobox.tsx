"use client";

import * as React from "react";
import { Check, ChevronDown, SearchX } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { filterOptions, highlightParts, optionsFromChildren, type ComboOption } from "./combobox-rules";

/**
 * Seletores padrão do portal. Substituem o <select> e o <datalist> do navegador (que têm visual próprio de
 * cada navegador e, no caso do datalist, nem sempre mostram as sugestões):
 *
 *  - <SelectBox>: escolher UM item de uma lista. Usa os <option> filhos, como o <select>; com mais de 7
 *    itens ganha um campo de busca. Funciona em formulário comum (name/required) e controlado (onValueChange).
 *  - <Combobox>: campo de texto com sugestões (código ou nome do produto, unidade). Com `allowCustom`, o
 *    que a pessoa digitar também vale.
 *
 * Teclado: setas, Home/End, Enter escolhe, Esc fecha. Dá para usar sem mouse e leitor de tela lê como combobox.
 */

const MAX_VISIBLE = 60;
const FREE_VALUE = "\u0000livre";
const SEARCH_FROM = 8;

const fieldClass =
  "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=open]:border-ring dark:bg-input/30";

const panelClass =
  "z-50 w-[max(var(--radix-popper-anchor-width),15rem)] max-w-[calc(100vw-1.5rem)] origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl outline-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none";

/** Lista de opções (a mesma nos dois seletores). */
function OptionList({
  id,
  options,
  total,
  query,
  active,
  onActive,
  onPick,
  selected,
  emptyText,
}: {
  id: string;
  options: ComboOption[];
  total: number;
  query: string;
  active: number;
  onActive: (i: number) => void;
  onPick: (o: ComboOption) => void;
  selected: string;
  emptyText?: string;
}) {
  const t = useT();
  const shown = options.slice(0, MAX_VISIBLE);
  React.useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [id, active]);

  if (shown.length === 0)
    return (
      <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center text-muted-foreground">
        <SearchX className="size-5" aria-hidden />
        <p className="text-sm">{emptyText ?? (query.trim() ? t("comum.seletor.semResultadoPara", { q: query.trim() }) : t("comum.seletor.semResultado"))}</p>
      </div>
    );

  return (
    <ul id={id} role="listbox" className="max-h-[min(20rem,calc(var(--radix-popper-available-height,22rem)-1rem))] overflow-y-auto overscroll-contain p-1.5">
      {shown.map((o, i) => {
        const isSel = o.value === selected;
        return (
          <li
            key={o.value}
            id={`${id}-${i}`}
            role="option"
            aria-selected={isSel}
            aria-disabled={o.disabled || undefined}
            data-active={i === active || undefined}
            onMouseMove={() => i !== active && onActive(i)}
            onMouseDown={(e) => e.preventDefault()} // não tira o foco do campo
            onClick={() => !o.disabled && onPick(o)}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              i === active && "bg-muted",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {o.hint && (
              <span className="w-[6.5rem] shrink-0 truncate rounded-md bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] leading-4 font-semibold text-muted-foreground tabular-nums ring-1 ring-border/70">
                <Marked text={o.hint} query={query} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate leading-snug", isSel ? "font-semibold" : "font-medium")}>
                <Marked text={o.label} query={query} />
              </span>
              {o.description && (
                <span className="block truncate text-xs text-muted-foreground">
                  <Marked text={o.description} query={query} />
                </span>
              )}
            </span>
            {o.meta && <span className={cn("shrink-0 text-xs tabular-nums", o.metaTone === "danger" ? "font-medium text-destructive" : "text-muted-foreground")}>{o.meta}</span>}
            {isSel && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
          </li>
        );
      })}
      {options.length > shown.length && (
        <li role="presentation" className="px-2.5 pt-1.5 pb-1 text-center text-xs text-muted-foreground">
          {t("comum.seletor.mostrando", { n: shown.length, total })}
        </li>
      )}
    </ul>
  );
}

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-[3px] bg-primary/15 px-px text-inherit">
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  );
}

/** Teclas de navegação comuns. Devolve true se tratou a tecla. */
function navigate(e: React.KeyboardEvent, count: number, active: number, setActive: (i: number) => void) {
  if (count === 0) return false;
  if (e.key === "ArrowDown") setActive(Math.min(active + 1, Math.min(count, MAX_VISIBLE) - 1));
  else if (e.key === "ArrowUp") setActive(Math.max(active - 1, 0));
  else if (e.key === "Home" && (e.ctrlKey || e.target instanceof HTMLButtonElement || (e.target as HTMLElement).getAttribute("role") === "listbox")) setActive(0);
  else if (e.key === "End" && (e.ctrlKey || e.target instanceof HTMLButtonElement || (e.target as HTMLElement).getAttribute("role") === "listbox")) setActive(Math.min(count, MAX_VISIBLE) - 1);
  else return false;
  e.preventDefault();
  return true;
}

// ------------------------------------------------------------------ Combobox (campo com sugestões)

export type ComboboxProps = {
  id?: string;
  name?: string;
  options: ComboOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  /** O texto digitado também vale (ex.: unidade). Sem isso, só vale o que está na lista. */
  allowCustom?: boolean;
  /**
   * Modo "pode digitar o que não está na lista" (ex.: insumo fora do cadastro). O que for digitado sem escolher
   * uma sugestão chega aqui em tempo real, e `value` volta a ficar vazio. Mostra a linha "Usar “texto”" no fim.
   */
  freeText?: string;
  onFreeTextChange?: (text: string) => void;
  /** Texto quando não há o que mostrar (ex.: "Escolha a base primeiro"). */
  emptyText?: string;
  className?: string;
  maxLength?: number;
  "aria-label"?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
};

export function Combobox({
  id,
  name,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder,
  disabled,
  required,
  invalid,
  allowCustom,
  freeText,
  onFreeTextChange,
  emptyText,
  className,
  maxLength,
  "aria-label": ariaLabel,
  onKeyDown,
}: ComboboxProps) {
  const t = useT();
  const free = !!onFreeTextChange;
  const autoId = React.useId();
  const listId = `${id ?? autoId}-list`;
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const setCurrent = (v: string) => (value === undefined && setInner(v), onValueChange?.(v));
  const [query, setQuery] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const wrap = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === current);
  const text = query ?? (allowCustom ? current : (selected?.label ?? (free ? (freeText ?? "") : "")));
  const filtered = React.useMemo(() => filterOptions(options, query ?? ""), [options, query]);
  const base = allowCustom && query !== null && query.trim() === "" ? options : filtered;
  // Modo texto livre: a última linha oferece usar o que foi digitado, mesmo sem sugestão correspondente.
  const typed = (query ?? "").trim();
  const list = React.useMemo(
    () => (free && typed ? [...base, { value: FREE_VALUE, label: t("comum.seletor.usarTexto", { q: typed }), description: t("comum.seletor.foraCadastro") }] : base),
    [free, typed, base, t],
  );
  const isOpen = open && !disabled && (list.length > 0 || !allowCustom);

  const close = (revert = true) => {
    setOpen(false);
    if (revert && !allowCustom) setQuery(null);
  };
  const pick = (o: ComboOption) => {
    if (o.value === FREE_VALUE) {
      // Fica o texto digitado; o campo mostra ele mesmo depois de fechar.
      setCurrent("");
      onFreeTextChange?.(typed);
      setQuery(null);
      setOpen(false);
      return;
    }
    setCurrent(o.value);
    if (free) onFreeTextChange?.("");
    setQuery(null);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={(o) => !o && close()}>
      <PopoverPrimitive.Anchor asChild>
        <div ref={wrap} className={cn("relative", className)}>
          {name && !allowCustom && <input type="hidden" name={name} value={current} disabled={disabled} />}
          <input
            id={id}
            name={allowCustom ? name : undefined}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={isOpen && list[active] ? `${listId}-${active}` : undefined}
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel}
            autoComplete="off"
            spellCheck={false}
            data-state={isOpen ? "open" : "closed"}
            value={text}
            required={required}
            maxLength={maxLength}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(fieldClass, "pr-9 placeholder:text-muted-foreground")}
            onFocus={(e) => e.currentTarget.select()}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
              if (allowCustom) setCurrent(e.target.value);
              if (free) {
                if (current) setCurrent("");
                onFreeTextChange?.(e.target.value.trim());
              }
            }}
            onKeyDown={(e) => {
              onKeyDown?.(e);
              if (e.defaultPrevented) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                if (!isOpen) {
                  setOpen(true);
                  e.preventDefault();
                  return;
                }
                navigate(e, list.length, active, setActive);
              } else if ((e.key === "Home" || e.key === "End") && isOpen && e.ctrlKey) navigate(e, list.length, active, setActive);
              else if (e.key === "Enter" && isOpen && list[active]) {
                e.preventDefault();
                pick(list[active]);
              } else if (e.key === "Escape" && isOpen) {
                e.preventDefault();
                e.stopPropagation();
                close();
              } else if (e.key === "Tab" && isOpen && query?.trim() && !allowCustom && !free && list[active]) pick(list[active]);
            }}
            onBlur={(e) => {
              if (content.current?.contains(e.relatedTarget as Node)) return;
              setOpen(false);
              if (!allowCustom && query !== null) {
                if (query.trim() === "") {
                  setCurrent("");
                  if (free) onFreeTextChange?.("");
                }
                setQuery(null);
              }
            }}
          />
          <ChevronDown
            aria-hidden
            className={cn("pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground transition-transform", isOpen && "rotate-180")}
          />
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={content}
          data-slot="combobox-content"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={panelClass}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => wrap.current?.contains(e.target as Node) && e.preventDefault()}
        >
          <OptionList id={listId} options={list} total={list.length} query={query ?? ""} active={active} onActive={setActive} onPick={pick} selected={current} emptyText={emptyText} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ------------------------------------------------------------------ SelectBox (escolher um item)

export type SelectBoxProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Opções prontas (com código, descrição...). Sem isso, usa os <option> filhos. */
  options?: ComboOption[];
  placeholder?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  /** Força o campo de busca ligado ou desligado. Padrão: liga com 8 itens ou mais. */
  searchable?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function SelectBox({
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  options: given,
  placeholder: givenPlaceholder,
  children,
  disabled,
  required,
  invalid,
  searchable,
  className,
  "aria-label": ariaLabel,
}: SelectBoxProps) {
  const t = useT();
  const autoId = React.useId();
  const listId = `${id ?? autoId}-list`;
  const parsed = React.useMemo(() => (given ? { options: given, placeholder: null } : optionsFromChildren(children)), [given, children]);
  const options = parsed.options;
  const placeholder = givenPlaceholder ?? parsed.placeholder ?? t("comum.escolha");
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const typed = React.useRef({ text: "", at: 0 });
  const search = searchable ?? options.length >= SEARCH_FROM;

  const filtered = React.useMemo(() => filterOptions(options, query), [options, query]);
  const selected = options.find((o) => o.value === current);
  const empty = !selected || (current === "" && (required || !!parsed.placeholder));

  const choose = (o: ComboOption) => {
    if (value === undefined) setInner(o.value);
    onValueChange?.(o.value);
    setOpen(false);
  };
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      setQuery("");
      setActive(Math.max(0, options.findIndex((x) => x.value === current)));
    }
  };

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (navigate(e, filtered.length, active, setActive)) return;
    if (e.key === "Enter" || (e.key === " " && !search)) {
      e.preventDefault();
      if (filtered[active] && !filtered[active].disabled) choose(filtered[active]);
    } else if (e.key === "Tab") setOpen(false);
    else if (!search && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // digitar a inicial vai para o item (como no <select>)
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const at = filtered.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (at >= 0) setActive(at);
    }
  };

  return (
    <PopoverPrimitive.Root open={open && !disabled} onOpenChange={onOpenChange}>
      <div className={cn("relative", className)}>
        {/* Campo invisível: leva o valor no formulário e faz o "required" funcionar como no <select>. */}
        <input
          name={name}
          value={current}
          required={required}
          disabled={disabled}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
        <PopoverPrimitive.Trigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel}
            disabled={disabled}
            className={fieldClass}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                onOpenChange(true);
              }
            }}
          >
            <span className={cn("min-w-0 flex-1 truncate", empty && "text-muted-foreground")}>{selected && !(current === "" && !!parsed.placeholder) ? selected.label : placeholder}</span>
            <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </PopoverPrimitive.Trigger>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="select-content"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={panelClass}
          onKeyDown={onPanelKey}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector<HTMLElement>(search ? "input" : "[role=listbox]")?.focus();
          }}
        >
          {search && (
            <div className="border-b p-2">
              <input
                type="text"
                role="searchbox"
                aria-label={t("comum.seletor.buscar")}
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                autoComplete="off"
                spellCheck={false}
                value={query}
                placeholder={t("comum.seletor.buscar")}
                onChange={(e) => (setQuery(e.target.value), setActive(0))}
                className="h-8 w-full rounded-md bg-muted px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          )}
          <div tabIndex={-1} className="outline-none" aria-activedescendant={!search && filtered[active] ? `${listId}-${active}` : undefined} role={search ? undefined : "presentation"}>
            <OptionList id={listId} options={filtered} total={filtered.length} query={query} active={active} onActive={setActive} onPick={choose} selected={current} />
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
