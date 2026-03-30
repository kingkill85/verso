declare module "@/lib/foliate/view.js" {
  export function makeBook(file: Blob | ArrayBuffer | File): Promise<any>;
  export class View extends HTMLElement {
    open(book: any): Promise<void>;
    close(): void;
    init(opts?: any): Promise<void>;
    goTo(target: string): Promise<void>;
    goToFraction(fraction: number): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    addAnnotation(annotation: any): void;
    deleteAnnotation(annotation: any): void;
    renderer: any;
  }
}

declare module "@/lib/foliate/overlayer.js" {
  export class Overlayer {
    static highlight(range: Range, options?: any): any;
  }
}

declare module "@/lib/foliate/epubcfi.js" {
  export function fromRange(range: Range): string | null;
  export function toRange(doc: Document, cfi: string): Range | null;
}
