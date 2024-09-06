// Restructured from https://gist.github.com/blixt/f17b47c62508be59987b
export default class SeededRandom {
    private _seed: number;

    constructor(seed: number) {
        this._seed = seed % 2147483647;
        if (this._seed <= 0) this._seed += 2147483646;
    }

    public next(): number {
        return this._seed = this._seed * 16807 % 2147483647;
    }

    public nextFloat(): number {
        return (this.next() - 1) / 2147483646;
    }

    public nextMongoId(): string {
        const timestamp = Math.floor(this.next()).toString(16);
        const objectId = timestamp + "xxxxxxxxxxxxxxxx".replace(/[x]/g, () => {
            return Math.floor(this.nextFloat() * 16).toString(16);
        }).toLowerCase();
    
        return objectId;
    }
}