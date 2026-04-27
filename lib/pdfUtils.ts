import fs from 'fs';
import path from 'path';

export const getFilledPDFs = (eqNumber: string) => {
    const templateDir = path.join(process.cwd(), 'templates');
    
    // Safety check: if folder doesn't exist, return empty
    if (!fs.existsSync(templateDir)) return [];
    
    const files = fs.readdirSync(templateDir);
    
    return files
        .filter(file => file.includes(eqNumber))
        .map(file => {
            const filePath = path.join(templateDir, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                path: `/templates/${file}`,
                date: stats.mtime
            };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime()); // Fixed Math
};
