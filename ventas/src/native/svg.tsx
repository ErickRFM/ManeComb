type SvgXmlProps = {
  xml: string;
  width?: number | string;
  height?: number | string;
};

export function SvgXml({ xml, width, height }: SvgXmlProps) {
  const sizedXml = xml.replace(
    '<svg ',
    '<svg style="display:block;width:100%;height:100%;max-width:100%;" '
  );

  return (
    <div
      aria-hidden="true"
      style={{
        display: 'block',
        height,
        lineHeight: 0,
        overflow: 'hidden',
        width,
      }}
      dangerouslySetInnerHTML={{ __html: sizedXml }}
    />
  );
}
