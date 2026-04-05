
import { getGoogleDocContent } from '@/lib/sheets';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// TODO: Replace with your actual Google Doc ID
const DOCUMENT_ID = 'https://docs.google.com/document/d/1PPjg0gov0Ma9Hr29yNLMCcy6dgKfx1ovYNRW4xpQ0uw/edit?usp=sharing';

// A simple component to render Google Doc content
const DocRenderer = ({ content }: { content: any }) => {
  if (!content || !content.body || !content.body.content) {
    return <p>Document is empty or could not be loaded.</p>;
  }

  return (
    <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto">
      {content.body.content.map((element: any, index: number) => {
        if (element.paragraph) {
          const styleType = element.paragraph.paragraphStyle?.namedStyleType;
          const textElements = element.paragraph.elements.map((el: any, i: number) => {
              if (el.textRun) {
                const textStyle = el.textRun.textStyle;
                let content = <>{el.textRun.content}</>;
                if (textStyle?.bold) content = <b>{content}</b>;
                if (textStyle?.italic) content = <i>{content}</i>;
                if (textStyle?.underline) content = <u>{content}</u>;
                if (textStyle?.link) return <a href={textStyle.link.url} key={i} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{content}</a>;
                return <span key={i}>{content}</span>;
              }
              return null;
            }).filter(Boolean);

          if (styleType === 'TITLE') {
            return <h1 key={index} className="text-4xl font-bold mb-4 mt-6 border-b pb-2">{textElements}</h1>;
          }
          if (styleType === 'HEADING_1') {
            return <h1 key={index} className="text-3xl font-bold mb-3 mt-5 border-b pb-2">{textElements}</h1>;
          }
          if (styleType === 'HEADING_2') {
            return <h2 key={index} className="text-2xl font-bold mb-3 mt-4">{textElements}</h2>;
          }
          if (styleType === 'HEADING_3') {
            return <h3 key={index} className="text-xl font-bold mb-2 mt-3">{textElements}</h3>;
          }

          return (
            <p key={index} className="mb-4 leading-relaxed">
              {textElements}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
};

export default async function IndianStockScreeningStrategyDocPage() {
  let docContent;
  let error;

  try {
    if (DOCUMENT_ID === 'YOUR_DOCUMENT_ID_HERE') {
        throw new Error('Please replace "YOUR_DOCUMENT_ID_HERE" with your actual Google Doc ID in src/app/notes/page.tsx.');
    }
    docContent = await getGoogleDocContent(DOCUMENT_ID);
  } catch (e: any) {
    error = e.message;
  }
  
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Indian Stock Screening Strategy Doc</CardTitle>
          <CardDescription>
            This is a read-only view of your Google Doc. Editing is not yet supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white p-8 md:p-12 lg:p-16 rounded-lg shadow-inner border min-h-[80vh]">
            {error ? (
              <div className="text-destructive">
                <p className="font-bold text-lg">Failed to load document:</p>
                <p className="mt-2">{error}</p>
                <div className="mt-6 text-sm text-foreground bg-muted p-4 rounded-md">
                    <p className="font-semibold">To fix this:</p>
                    <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>Make sure you have replaced the placeholder Document ID in the file: <code className="bg-background p-1 rounded font-mono text-xs">src/app/notes/page.tsx</code></li>
                        <li>Share your Google Doc with the service account email below, giving it at least "Viewer" permissions.</li>
                    </ol>
                    <p className="mt-4">
                        Service Account Email: <code className="bg-background p-1 rounded font-mono text-xs">{process.env.GOOGLE_SHEETS_CLIENT_EMAIL}</code>
                    </p>
                </div>
              </div>
            ) : (
              <DocRenderer content={docContent} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
