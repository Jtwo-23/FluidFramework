const fs = require('fs');

// Read the JSON file content
const jsonData = fs.readFileSync('docs/data/versions.json', 'utf8');

// Parse the JSON data
const parsedData = JSON.parse(jsonData);

// Extract values from "previousVersions" and output for Bash processing
return(console.log(parsedData.params.previousVersions.join('\n')));