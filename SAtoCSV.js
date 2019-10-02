const program = require('commander');
const glob = require('glob');
const fs = require('fs');
const fastcsv = require('fast-csv');
const readFile = require('util').promisify(fs.readFile);
const readLine = require('readline');

program
	.version(require('./package.json').version)
	.option('-i, --input <path/to/folder>', 'path to the folder with the minXXYYZZ.json or the  days_hist_all files', 'input/')
	.option('-o, --output <path/to/folder>', 'path to save the results', 'output/')
	.option('-w, --header <boolean>', 'write header [true/false]', true)
	.option('-e, --efficiency <value>', 'PAC / PDC efficiency', 98)
	.option('-u, --udc <value>', 'UDC value', 230);

program.command('minutes <format>')
	.description('Process the "minXXYYZZ.json" files. Output format "plain" as simple CSV or "sl" for Solar-Log compatible format')
	.action(processJsonFiles);

program.command('day')
	.description('Process the "days_hist_all" file')
	.action(processDayData);

program.command('kaco')
	.description('Process the Kaco CSV files')
	.action(processKacoData);

program.parse(process.argv);

if (process.argv.length < 3) {
	program.help();
}

const headerMinute = [['id', 'date', 'time', 'Leistung[W]', 'Ertrag[kWh]', 'Verbrauch[W]', 'Verbrauch[kWh]']];
const headerDay = [['Datum', 'Erzeugung[Wh]', 'Verbrauch[Wh]', 'Eigenverbrauch[Wh]']];
const headerKaco = [['Datum', 'Erzeugung[Wh]']];

function deleteFile(files) {
	files.map(fileName => {
		const promise = new Promise((resolve, reject) => {
			fs.unlink(fileName, err => {
				if (err && err.code === 'ENOENT') {
					resolve(true);
				} else if (err) {
					reject(err);
				} else {
					resolve(true);
				}
			});
		});
		return promise;
	});
}

function writeHeader(fileName, header) {
	return new Promise((resolve, reject) => {
		fastcsv
			.writeToStream(fs.createWriteStream(fileName), header, {headers: true, delimiter: ';'})
			.on('error', err => reject(err))
			.on('finish', () => resolve(true));
	});
}

function buildFileList(globPattern) {
	return new Promise((resolve, reject) => {
		glob(globPattern, {matchBase: true}, (err, files) => {
			if (err) {
				reject(err);
			} else {
				resolve(files);
			}
		});
	});
}

function readFromFile(file, format) {
	return new Promise((resolve, reject) => {
		readFile(file, 'utf8', (err, data) => {
			if (err) {
				reject(err);
			} else {
				const nameLgth = file.length;
				const baseName = file.substr(nameLgth - 14, 9);
				const dataDate = file.substr(nameLgth - 7, 2) + '.' + file.substr(nameLgth - 9, 2) + '.' + file.substr(nameLgth - 11, 2);
				const obj = JSON.parse(data);
				const key = Object.keys(obj['776'])[0];
				const solarValues = [];
				if (format === 'plain') {
					obj['776'][key].map((item, i) => solarValues.push([i, dataDate, item[0], item[1][0][0], item[1][0][1], item[1][1][0], item[1][1][1]]));
					resolve(solarValues);
				} else if (format === 'sl') {
					// Kennung;Datum und Uhrzeit;PAC in W;PDC in W;Tagesertrag des WR zur aktuellen Uhrzeit in Wh;UDC in V
					obj['776'][key].map(item => solarValues.push(['m[mi++]="' + dataDate + ' ' + item[0] + '|' + item[1][0][0], Math.round(item[1][0][0] / (program.efficiency / 100)), item[1][0][1], program.udc + '"']));
					resolve([solarValues, baseName]);
				}
			}
		});
	});
}

function readCSV(file) {
	return new Promise((resolve, reject) => {
		const csvFile = fs.createReadStream(file, 'utf8');
		const csvStream = fastcsv.parse({headers: ['WR', 'Serial', 'RS485', 'IP', 'Yield'], renameHeaders: true, delimiter: ';'});
		const rows = [];
		const nameLgth = file.length;
		const dataDate = file.substr(nameLgth - 6, 2) + '.' + file.substr(nameLgth - 8, 2) + '.' + file.substr(nameLgth - 12, 4);

		csvFile.pipe(csvStream);

		function onData(row) {
			rows.push(row);
			if (rows.length === 1) {
				csvStream.emit('doneReading'); // Custom event to handle end of reading
			}
		}

		csvStream.on('data', onData);
		csvStream.on('error', err => {
			reject(err);
		});
		csvStream.on('doneReading', () => {
			csvFile.close();
			csvStream.removeListener('data', onData);
			resolve([[dataDate, String(Number(rows[0].Yield) * 1000) + '\n']]);
		});
	});
}

function csvAppend(filename, rows = [], format) {
	return new Promise((resolve, reject) => {
		if (format === 'plain') {
			const csvFile = fs.createWriteStream(filename, {flags: 'a'});
			csvFile.write('\n');
			fastcsv
				.writeToStream(csvFile, rows, {headers: false, quote: false, delimiter: ';'})
				.on('error', err => reject(err))
				.on('finish', () => resolve(true));
		} else if (format === 'sl') {
			const csvFile = fs.createWriteStream(filename + '.js');
			fastcsv
				.writeToStream(csvFile, rows, {headers: false, quote: false, delimiter: ';'})
				.on('error', err => reject(err))
				.on('finish', () => resolve(true));
		} else if (format === 'kaco') {
			const csvFile = fs.createWriteStream(filename, {flags: 'a'});
			fastcsv
				.writeToStream(csvFile, rows, {headers: false, quote: false, delimiter: ';'})
				.on('error', err => reject(err))
				.on('finish', () => resolve(true));
		}
	});
}

async function processJsonFiles(format) {
	try {
		const filesDeleteList = await buildFileList(program.output + '*');
		await deleteFile(filesDeleteList);

		if (program.header && format !== 'sl') {
			await writeHeader(program.output + 'result.csv', headerMinute);
		}

		const fileList = await buildFileList(program.input + '/**/min{0..9}*.json');
		if (format === 'plain') {
			for (const file of fileList) {
				const rows = await readFromFile(file, format);
				await csvAppend(program.output + 'result.csv', rows, format);
			}
		} else if (format === 'sl') {
			for (const file of fileList) {
				const result = await readFromFile(file, format);
				await csvAppend(program.output + result[1], result[0], format);
			}
		}
	} catch (err) {
		console.error(err.message);
	}
}

async function processDayData() {
	try {
		const fileStream = fs.createReadStream(program.input + 'days_hist_all');
		const rl = readLine.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});
		const dayData = [];
		for await (const line of rl) {
			let tmp = [];
			tmp = line
				.split('=')
				.join(',')
				.split('|')
				.join(',')
				.split(';')
				.join(',')
				.split(',');
			dayData.push({
				date: Number(tmp[0]),
				yield: isNaN(Number(tmp[1])) ? 0 : Number(tmp[1]),
				consumption: isNaN(Number(tmp[2])) ? 0 : Number(tmp[2]),
				self: isNaN(Number(tmp[3])) ? 0 : Number(tmp[3])
			});
		}

		const csvData = [];
		dayData
			.sort((a, b) => a.date - b.date)
			.map(item => csvData.push([String(item.date).substr(4, 2) + '.' + String(item.date).substr(2, 2) + '.' + String(item.date).substr(0, 2), item.yield, item.consumption, item.self]));

		const filesDeleteList = await buildFileList(program.output + '*');
		await deleteFile(filesDeleteList);
		if (program.header) {
			await writeHeader(program.output + 'result.csv', headerDay);
		}

		await csvAppend(program.output + 'result.csv', csvData, 'plain');
	} catch (err) {
		console.error('bla: ' + err.message);
	}
}

async function processKacoData() {
	try {
		const filesDeleteList = await buildFileList(program.output + '*');
		await deleteFile(filesDeleteList);

		if (program.header) {
			await writeHeader(program.output + 'result.csv', headerKaco);
		}

		const fileList = await buildFileList(program.input + '/**/*.CSV');
		for (const file of fileList) {
			const rows = await readCSV(file);
			await csvAppend(program.output + 'result.csv', rows, 'kaco');
		}
	} catch (err) {
		console.error('bla: ' + err.message);
	}
}

