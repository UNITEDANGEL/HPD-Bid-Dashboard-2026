import fs from 'fs';
import path from 'path';

export const getFilledPDFs = (eqNumber) => {
    const templateDir = path.join(process.cwd(), 'templates');
    const files = fs.readdirSync(templateDir);
    
    // Find all files that contain the specific EQ number
    return files.filter(file => file.includes(eqNumber))
                .map(file => ({
                    name: file,
                    path: \/templates/\\,
                    date: fs.statSync(path.join(templateDir, file)).mtime
                }))
                .sort((a, b) => b.date - a.date); // Most recent first
};
