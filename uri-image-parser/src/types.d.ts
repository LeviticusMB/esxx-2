
declare module 'canvas' {
    export = Canvas;

    interface Image extends HTMLImageElement {
        new(width?: number, height?: number): Image;
        src: string | Buffer | any;
    }

    interface Canvas extends HTMLCanvasElement {
        new(width: number, height: number, type?: 'pdf' | 'svg'): Canvas;

        Image: typeof Image;
    }

    var Canvas: Canvas;
}
