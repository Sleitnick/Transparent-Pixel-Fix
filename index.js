"use strict";

const jimp = require("jimp");
const Delaunay = require("d3-delaunay").Delaunay;
const fs = require("fs");
const path = require("path");

const neighborLocations = [
	[-1, -1],
	[ 0, -1],
	[ 1, -1],
	[ 1,  0],
	[ 1,  1],
	[ 0,  1],
	[-1,  1],
	[-1,  0]
];

let argsArray = process.argv.slice(2);

let dbgMode = false;

for (let i = argsArray.length + 1; i >= 0; i--) {
	let arg = argsArray[i];
	if (arg === "-d") {
		dbgMode = true;
		argsArray.splice(i, 1);
	}
}

if (process.argv.length < 3) {
	console.log("pixelfix \"path to file\" to fix transparent pixels in file");
	console.log("pixelfix \"path to file\" \"path to file 2\" to fix transparent pixels in multiple files");
	console.log("pixelfix \"path to dir\" to fix transparent pixels in image files directly within the directory");
	console.log("pixelfix -d \"path to file\" to view debug output (will overwrite file)");
	return;
}

let fileLocations = [];
for (const fileLocation of argsArray) {
	if (fs.statSync(fileLocation).isDirectory()) {
		const children = fs.readdirSync(fileLocation)
			.filter((child) => child.match(/\.(png|bmp|tiff|jpg|jpeg)$/i))
			.map((child) => path.join(fileLocation, child));
		fileLocations = fileLocations.concat(children);
		if (children.length === 0) {
			console.warn(`${fileLocation} has no image files (They must be direct children of the directory)`);
		}
	} else {
		fileLocations.push(fileLocation);
	}
}

const promises = [];
for (let fileLocation of fileLocations) {
	promises.push((async () => {
		console.log(`${fileLocation}...`);
		const image = await jimp.read(fileLocation);
		const voronoiPoints = [];
		const voronoiColors = [];
		image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
			const alpha = this.bitmap.data[idx + 3];
			if (alpha !== 0) {
				const r = this.bitmap.data[idx + 0];
				const g = this.bitmap.data[idx + 1];
				const b = this.bitmap.data[idx + 2];
				// Voronoi
				for (let offset of neighborLocations) {
					let neighborAlpha = this.bitmap.data[image.getPixelIndex(x + offset[0], y + offset[1]) + 3];
					if (neighborAlpha === 0) {
						voronoiPoints.push([x, y]);
						voronoiColors.push([r, g, b]);
						break;
					} 
				}
			}
		});
		if (voronoiPoints.length > 0) {
			const dela = Delaunay.from(voronoiPoints);
			image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
				const alpha = this.bitmap.data[idx + 3];
				if (alpha === 0) { 
					const closestIndex = dela.find(x, y);
					if (closestIndex !== -1) {
						const color = voronoiColors[closestIndex];
						this.bitmap.data[idx + 0] = color[0];
						this.bitmap.data[idx + 1] = color[1];
						this.bitmap.data[idx + 2] = color[2];
						if (dbgMode) {
							this.bitmap.data[idx + 3] = 255;
						}
					}
				}
			});
			await image.writeAsync(fileLocation);
			console.log(`Written to ${fileLocation}`);
		} else {
			console.log(`No transparent pixels to fix in ${fileLocation}`);
		}
	})());
}

Promise.all(promises).then(() => {
	console.log("Press any key to exit");
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.on("data", process.exit.bind(process, 0));
}).catch((err) => {
	console.error(err);
});