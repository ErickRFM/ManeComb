type SvgXmlProps = {
  xml: string;
  width?: number | string;
  height?: number | string;
};

export function SvgXml({ xml, width, height }: SvgXmlProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'block',
        height,
        lineHeight: 0,
        width,
      }}
      dangerouslySetInnerHTML={{ __html: xml }}
    />
  );
}
