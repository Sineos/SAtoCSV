
# SAtoCSV

 Convert SolarAnalyzer data format to Solar-Log data formats.

## Descrition

This Node.js script takes the data files of a [SolarAnalyzer](http://sunics.de/solaranalyzer_beschreibung.htm) installation and converts them to a format that can be imported into Solar-Log or processed further as CSV file.

The script has been written with my setup in mind (Kaco inverter, S0 power meter) but may work for other setups as well. If you need help feel free to open a GitHub issue .

## Installation

 1. Install [Node.js](https://nodejs.org/en/) with version 11.4.0 or greater
 2. Download or clone the [GitHub repository](https://github.com/Sineos/SAtoCSV)
 3. Open shell / command prompt in the SAtoCSV folder and run `npm install`
 4. Call the script with `node SAtoCSV.js` to get a short description of the available command and options
 5. Default options do expect the SolarAnalyzer files in the `input` folder and will put the processed files into the `output` folder