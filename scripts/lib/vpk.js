// Minimal reader for Valve VPK (version 1 and 2) archives, used to pull text files such as
// scripts/npc/npc_abilities.txt straight from Dota's pak01_dir.vpk.

const fs = require("fs");
const path = require("path");

const SIGNATURE = 0x55aa1234;
const DATA_IN_DIRECTORY = 0x7fff;

class VpkReader {
    /** @param {string} directoryFile Path to the *_dir.vpk file. */
    constructor(directoryFile) {
        this.directoryFile = directoryFile;
        this.buffer = fs.readFileSync(directoryFile);
        this.entries = new Map();
        this.readTree();
    }

    readTree() {
        const buf = this.buffer;
        if (buf.readUInt32LE(0) !== SIGNATURE) throw new Error(`${this.directoryFile} is not a VPK file`);
        const version = buf.readUInt32LE(4);
        const treeSize = buf.readUInt32LE(8);
        const headerSize = version === 1 ? 12 : version === 2 ? 28 : undefined;
        if (headerSize === undefined) throw new Error(`Unsupported VPK version ${version}`);
        this.dataOffset = headerSize + treeSize;

        let pos = headerSize;
        const readString = () => {
            const end = buf.indexOf(0, pos);
            const value = buf.toString("utf8", pos, end);
            pos = end + 1;
            return value;
        };

        for (let ext = readString(); ext !== ""; ext = readString()) {
            for (let dir = readString(); dir !== ""; dir = readString()) {
                for (let name = readString(); name !== ""; name = readString()) {
                    const preloadBytes = buf.readUInt16LE(pos + 4);
                    const entry = {
                        archiveIndex: buf.readUInt16LE(pos + 6),
                        offset: buf.readUInt32LE(pos + 8),
                        length: buf.readUInt32LE(pos + 12),
                        preloadOffset: pos + 18,
                        preloadBytes,
                    };
                    pos += 18 + preloadBytes;
                    const fullPath = (dir === " " ? "" : dir + "/") + name + (ext === " " ? "" : "." + ext);
                    this.entries.set(fullPath.toLowerCase(), entry);
                }
            }
        }
    }

    has(filePath) {
        return this.entries.has(normalize(filePath));
    }

    /** @returns {Buffer | undefined} */
    read(filePath) {
        const entry = this.entries.get(normalize(filePath));
        if (entry === undefined) return undefined;

        const preload = this.buffer.subarray(entry.preloadOffset, entry.preloadOffset + entry.preloadBytes);
        if (entry.length === 0) return Buffer.from(preload);

        let data;
        if (entry.archiveIndex === DATA_IN_DIRECTORY) {
            const start = this.dataOffset + entry.offset;
            data = this.buffer.subarray(start, start + entry.length);
        } else {
            const archive = this.directoryFile.replace(/_dir\.vpk$/i, `_${String(entry.archiveIndex).padStart(3, "0")}.vpk`);
            const fd = fs.openSync(archive, "r");
            try {
                data = Buffer.alloc(entry.length);
                fs.readSync(fd, data, 0, entry.length, entry.offset);
            } finally {
                fs.closeSync(fd);
            }
        }
        return Buffer.concat([preload, data]);
    }
}

function normalize(filePath) {
    return path.posix.normalize(filePath.replace(/\\/g, "/")).toLowerCase();
}

module.exports = { VpkReader };
