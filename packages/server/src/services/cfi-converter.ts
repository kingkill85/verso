const CFI_PATTERN = /^epubcfi\((.+)\)$/;
const CFI_SPINE_PATTERN = /^\/6\/(\d+)!(.*)$/;
const CFI_PATH_STEP_PATTERN = /\/(\d+)(?:\[(.*?)\])?(?::(\d+))?/g;
const XPOINTER_DOC_FRAGMENT_PATTERN = /^\/body\/DocFragment\[(\d+)\](?:\.(\d+))?(?:\/body(.*))?$/;
const XPOINTER_TEXT_OFFSET_PATTERN = /\/text\(\)\.(\d+)$/;
const XPOINTER_SEGMENT_WITH_INDEX_PATTERN = /^(\w+)\[(\d+)\](?:\.\d+)?$/;
const XPOINTER_SEGMENT_WITHOUT_INDEX_PATTERN = /^(\w+)(?:\.\d+)?$/;

const INLINE_ELEMENTS = new Set([
  "span", "em", "strong", "i", "b", "u", "small", "mark", "sup", "sub",
]);

type CfiStep = { index: number; assertion: string | null };

/**
 * Extracts spine index from either a CFI or XPointer string.
 */
export function extractSpineIndex(cfiOrXPointer: string): number {
  if (cfiOrXPointer.startsWith("epubcfi(")) {
    const cfiMatch = cfiOrXPointer.match(CFI_PATTERN);
    if (!cfiMatch) throw new Error(`Invalid CFI format: ${cfiOrXPointer}`);
    const spineMatch = cfiMatch[1].match(CFI_SPINE_PATTERN);
    if (!spineMatch) throw new Error(`Cannot extract spine index from CFI: ${cfiOrXPointer}`);
    return (parseInt(spineMatch[1]) - 2) / 2;
  }
  if (cfiOrXPointer.startsWith("/body/DocFragment[")) {
    const match = cfiOrXPointer.match(/DocFragment\[(\d+)\]/);
    if (!match) throw new Error(`Cannot extract spine index from XPointer: ${cfiOrXPointer}`);
    return parseInt(match[1]) - 1;
  }
  throw new Error(`Unsupported format: ${cfiOrXPointer}`);
}

export class CfiConverter {
  private doc: Document;
  private spineIndex: number;

  constructor(document: Document, spineIndex: number) {
    this.doc = document;
    this.spineIndex = spineIndex;
  }

  /** Convert KOReader XPointer to EPUB CFI */
  xPointerToCfi(xpointer: string): string {
    const { element, textOffset } = this.parseXPointer(xpointer);
    let cfiPath = this.buildCfiPathFromElement(element);
    if (textOffset != null) {
      cfiPath += `/1:${textOffset}`;
    }
    return this.buildFullCfi(cfiPath);
  }

  /** Convert EPUB CFI to KOReader XPointer */
  cfiToXPointer(cfi: string): string {
    const cfiMatch = cfi.match(CFI_PATTERN);
    if (!cfiMatch) throw new Error(`Invalid CFI format: ${cfi}`);
    const spineMatch = cfiMatch[1].match(CFI_SPINE_PATTERN);
    if (!spineMatch) throw new Error(`Cannot parse CFI spine step: ${cfi}`);

    const spineStep = parseInt(spineMatch[1]);
    const cfiSpineIndex = (spineStep - 2) / 2;
    if (cfiSpineIndex !== this.spineIndex) {
      throw new Error(`CFI spine index ${cfiSpineIndex} does not match converter spine index ${this.spineIndex}`);
    }

    // Range CFIs have format: /parent,/start,/end — resolve parent+end as the position
    let contentPath = spineMatch[2];
    const commaIdx = contentPath.indexOf(",");
    if (commaIdx !== -1) {
      const parent = contentPath.slice(0, commaIdx);
      const rest = contentPath.slice(commaIdx + 1);
      const lastComma = rest.lastIndexOf(",");
      const end = lastComma !== -1 ? rest.slice(lastComma + 1) : rest;
      contentPath = parent + end;
    }

    const { steps, textOffset } = this.parseCfiPath(contentPath);
    const element = this.resolveElementFromCfiSteps(steps);
    if (!element) throw new Error(`Element not found for CFI: ${cfi}`);

    if (textOffset != null) {
      return this.handleTextOffset(element, textOffset);
    }
    return this.buildXPointerPath(element);
  }

  // ─── XPointer → CFI helpers ───

  private parseXPointer(xpointer: string): { element: Element; textOffset: number | null } {
    let textOffset: number | null = null;
    let elementPath = xpointer;

    const textMatch = xpointer.match(XPOINTER_TEXT_OFFSET_PATTERN);
    if (textMatch) {
      textOffset = parseInt(textMatch[1]);
      elementPath = xpointer.replace(XPOINTER_TEXT_OFFSET_PATTERN, "");
    }

    const element = this.resolveXPointerPath(elementPath);
    return { element, textOffset };
  }

  private resolveXPointerPath(path: string): Element {
    const pathMatch = path.match(XPOINTER_DOC_FRAGMENT_PATTERN);
    if (!pathMatch) throw new Error(`Invalid XPointer format: ${path}`);

    // Group 2 = optional .offset (short form like /body/DocFragment[30].0)
    // Group 3 = optional element path after /body
    const elementPath = pathMatch[3];
    const body = this.doc.body;
    if (!body) throw new Error("Document has no body element");
    if (!elementPath || elementPath === "") return body;

    const segments = elementPath.split("/").filter(Boolean);

    // Hierarchical traversal — walk each segment relative to its parent
    let current: Element = body;
    for (const segment of segments) {
      const segWith = segment.match(XPOINTER_SEGMENT_WITH_INDEX_PATTERN);
      const segWithout = segment.match(XPOINTER_SEGMENT_WITHOUT_INDEX_PATTERN);

      let tagName: string;
      let index: number;

      if (segWith) {
        tagName = segWith[1];
        index = parseInt(segWith[2]) - 1;
      } else if (segWithout) {
        tagName = segWithout[1];
        index = 0;
      } else {
        throw new Error(`Invalid XPointer segment: ${segment}`);
      }

      const matching = Array.from(current.children).filter(
        (c) => c.tagName.toLowerCase() === tagName.toLowerCase()
      );
      if (index >= matching.length) {
        throw new Error(`Element index ${index} out of bounds for tag ${tagName} (found ${matching.length})`);
      }
      current = matching[index] as Element;
    }
    return current;
  }

  private buildCfiPathFromElement(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.tagName.toLowerCase() !== "body") {
      const parent: Element | null = current.parentElement;
      if (!parent) break;

      let siblingIndex = 0;
      for (const sibling of Array.from(parent.children)) {
        siblingIndex++;
        if (sibling === current) break;
      }

      parts.unshift(`/${siblingIndex * 2}`);
      current = parent;
    }

    parts.unshift("/4");
    return parts.join("");
  }

  private buildFullCfi(contentPath: string): string {
    const spineStep = (this.spineIndex + 1) * 2;
    return `epubcfi(/6/${spineStep}!${contentPath})`;
  }

  // ─── CFI → XPointer helpers ───

  private parseCfiPath(contentPath: string): { steps: CfiStep[]; textOffset: number | null } {
    const steps: CfiStep[] = [];
    let textOffset: number | null = null;

    const regex = new RegExp(CFI_PATH_STEP_PATTERN.source, "g");
    let match;
    while ((match = regex.exec(contentPath)) !== null) {
      const stepIndex = parseInt(match[1]);
      const assertion = match[2] || null;
      if (match[3] != null) {
        textOffset = parseInt(match[3]);
      }
      steps.push({ index: stepIndex, assertion });
    }

    return { steps, textOffset };
  }

  private resolveElementFromCfiSteps(steps: CfiStep[]): Element | null {
    let current: Element | null = this.doc.body;
    if (!current) return null;

    // The first step in a content CFI path is always /4 (body element).
    // Since we start at body, skip that first step.
    const contentSteps = steps.length > 0 ? steps.slice(1) : steps;

    for (const step of contentSteps) {
      const childIndex = (step.index / 2) - 1;
      const children = current.children;
      if (childIndex < 0 || childIndex >= children.length) {
        return current;
      }
      current = children[childIndex] as Element;
    }

    return current;
  }

  private buildXPointerPath(targetElement: Element): string {
    const parts: string[] = [];
    let current: Element | null = targetElement;
    const root = this.doc.body?.parentElement ?? null;

    while (current && current !== root) {
      const parent: Element | null = current.parentElement;
      if (!parent) break;

      const tagName = current.tagName.toLowerCase();
      let siblingIndex = 0;
      let totalSameTag = 0;

      for (const sibling of Array.from(parent.children) as Element[]) {
        if (sibling.tagName.toLowerCase() === tagName) {
          if (sibling === current) siblingIndex = totalSameTag;
          totalSameTag++;
        }
      }

      // Omit the [1] index for first-occurrence elements — bare tag name implies index 1
      parts.unshift(siblingIndex === 0 ? tagName : `${tagName}[${siblingIndex + 1}]`);
      current = parent;
    }

    // Remove leading "body" if present — we add it in the prefix
    if (parts.length > 0 && parts[0].startsWith("body")) {
      parts.shift();
    }

    let xpointer = `/body/DocFragment[${this.spineIndex + 1}]/body`;
    if (parts.length > 0) {
      xpointer += "/" + parts.join("/");
    }
    return xpointer;
  }

  private handleTextOffset(element: Element, cfiOffset: number): string {
    const textNodes = this.collectTextNodes(element);
    let totalChars = 0;
    let targetNode: Node | null = null;
    let offsetInNode = 0;

    for (const node of textNodes) {
      const nodeLength = (node.textContent ?? "").length;
      if (totalChars + nodeLength >= cfiOffset) {
        targetNode = node;
        offsetInNode = cfiOffset - totalChars;
        break;
      }
      totalChars += nodeLength;
    }

    if (!targetNode) {
      return this.buildXPointerPath(element);
    }

    // Walk up to nearest significant (block) element
    let textParent: Element | null = targetNode.parentElement;
    while (textParent && INLINE_ELEMENTS.has(textParent.tagName.toLowerCase())) {
      textParent = textParent.parentElement;
    }
    const resolvedParent: Element = textParent ?? element;

    return this.buildXPointerPath(resolvedParent) + `/text().${offsetInNode}`;
  }

  private collectTextNodes(element: Element): Node[] {
    const nodes: Node[] = [];
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 /* TEXT_NODE */ && (child.textContent ?? "").length > 0) {
          nodes.push(child);
        } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
          walk(child);
        }
      }
    };
    walk(element);
    return nodes;
  }
}
